var BluetoothDataSources = [];
var BluetoothDevices = [];

// configure the buttons
var ConnectSourceButton = document.querySelector('#connect_button');
var StartStopLoggingButton = document.querySelector('#start_stop_logging_button');

// configure the display
var measuredCurrentDisplay = document.querySelector('#measured_current');
var measuredTempDisplay = document.querySelector('#measured_temperature');
var measuredHumidityDisplay = document.querySelector('#measured_humidity');
var isRecordingDisplay = document.querySelector('#logging_status');

// Measured current chart (uses Chart.js loaded in the page)
var measuredCurrentChart = null;
var measuredCurrentChartCanvas = document.getElementById('measured_current_chart');
if (measuredCurrentChartCanvas && typeof Chart !== 'undefined') {
  try {
    var ctx = measuredCurrentChartCanvas.getContext('2d');
    measuredCurrentChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Measured current (nA)',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: false,
          pointRadius: 0,
          tension: 0.15
        }, {
          label: 'Filtered current (nA)',
          data: [],
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: false,
          pointRadius: 0,
          tension: 0.15,
          borderDash: [5, 5]
          }, {
            label: 'Whitaker smoothed (50pt)',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.15)',
            fill: false,
            pointRadius: 0,
            tension: 0.15
          }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: true },
          y: { display: true }
        }
      }
    });
  } catch (e) { console.error('Chart init error', e); }
}

// Store raw data for filtering
var measuredCurrentRawData = [];
// Low-pass filtered data (for averaging)
var measuredCurrentLPData = [];
// LP filter alpha (0..1). Smaller alpha -> smoother (slower) response.
var lpAlpha = 0.005; // adjust as desired
// Whitaker smoothing configuration
var whitakerWindow = 50; // number of most-recent raw points to feed into Whitaker smoother
var whitakerLambda = 10000; // smoothing strength (larger -> smoother)
var whitakerDifferences = 2; // order of differences (usually 1 or 2)

// Whitaker (Eilers) smoothing implementation. Returns smoothed array same length as input y.
function whittakerSmooth(y, lambda, differences) {
  // y: array of numbers
  var n = y.length;
  if (n === 0) return [];
  if (!differences || differences < 1) differences = 2;

  // Build D matrix (m x n) where m = n - differences
  var m = Math.max(0, n - differences);
  var D = new Array(m);
  for (var row = 0; row < m; row++) {
    D[row] = new Array(n).fill(0);
    // set finite difference coefficients for this row
    // for order=1 it's [ -1, 1 ], for order=2 it's [1, -2, 1]
    if (differences === 1) {
      D[row][row] = -1;
      D[row][row + 1] = 1;
    } else if (differences === 2) {
      D[row][row] = 1;
      D[row][row + 1] = -2;
      D[row][row + 2] = 1;
    } else {
      // build coefficients using binomial with alternating signs
      for (var k = 0; k <= differences; k++) {
        // binomial coefficient
        var coeff = 1;
        for (var a = 0; a < k; a++) coeff = coeff * (differences - a) / (a + 1);
        // alternating sign
        coeff = coeff * ( (k % 2) ? -1 : 1 );
        D[row][row + k] = coeff;
      }
    }
  }

  // Build A = I + lambda * (D^T * D)
  // Initialize A as identity
  var A = new Array(n);
  for (var i = 0; i < n; i++) {
    A[i] = new Array(n).fill(0);
    A[i][i] = 1;
  }

  // Compute BtB = D^T * D and add lambda * BtB into A
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      var sum = 0;
      for (var r = 0; r < m; r++) {
        sum += D[r][i] * D[r][j];
      }
      if (sum !== 0) A[i][j] += lambda * sum;
    }
  }

  // Solve linear system A * z = y for z
  // Use Gaussian elimination with partial pivoting (suitable for small n)
  function solveLinearSystem(Ain, bin) {
    var N = Ain.length;
    // clone A and b
    var A = new Array(N);
    for (var i = 0; i < N; i++) A[i] = Ain[i].slice();
    var b = bin.slice();

    for (var k = 0; k < N; k++) {
      // partial pivot
      var maxRow = k;
      var maxVal = Math.abs(A[k][k]);
      for (var r = k + 1; r < N; r++) {
        var val = Math.abs(A[r][k]);
        if (val > maxVal) { maxVal = val; maxRow = r; }
      }
      if (maxRow !== k) {
        var tmp = A[k]; A[k] = A[maxRow]; A[maxRow] = tmp;
        var tb = b[k]; b[k] = b[maxRow]; b[maxRow] = tb;
      }

      var Akk = A[k][k];
      if (Math.abs(Akk) < 1e-12) continue; // singular-ish; skip
      // normalize and eliminate
      for (var i = k + 1; i < N; i++) {
        var factor = A[i][k] / Akk;
        b[i] -= factor * b[k];
        for (var j = k; j < N; j++) A[i][j] -= factor * A[k][j];
      }
    }

    // back substitution
    var x = new Array(N).fill(0);
    for (var i = N - 1; i >= 0; i--) {
      var s = b[i];
      for (var j = i + 1; j < N; j++) s -= A[i][j] * x[j];
      var aii = A[i][i];
      x[i] = (Math.abs(aii) < 1e-12) ? s / ( (Math.abs(s) < 1e-12) ? 1 : aii ) : s / aii;
    }
    return x;
  }

  var z = solveLinearSystem(A, y.slice());
  return z;
}

// Register bluetooth data sources, connect to parsers and display elements
registerBluetoothDataSource(BluetoothDataSources, "0000ff10-0000-1000-8000-00805f9b34fb", "0000ff12-0000-1000-8000-00805f9b34fb", blehandle_float, measuredCurrentDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, measuredTempDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000181a-0000-1000-8000-00805f9b34fb", "00002a6f-0000-1000-8000-00805f9b34fb", blehandle_float, measuredHumidityDisplay, '')

// logging state
var isLogging = false;

// Restart button handler
var RestartButton = document.querySelector('#restart_button');
var RestartStatus = document.querySelector('#restart_status');

function sendRestartCommand() {
  if (!BluetoothDevices || BluetoothDevices.length === 0) {
    RestartStatus.textContent = 'Not connected';
    return;
  }

  var device = BluetoothDevices[0];
  var serviceUUID = "0000ff10-0000-1000-8000-00805f9b34fb";
  var characteristicUUID = "0000ff11-0000-1000-8000-00805f9b34fb";

  device.gatt.connect()
    .then(server => server.getPrimaryService(serviceUUID))
    .then(service => service.getCharacteristic(characteristicUUID))
    .then(characteristic => {
      var data = new Uint8Array([0x00]);
      return characteristic.writeValue(data);
    })
    .then(() => {
      RestartStatus.textContent = 'Sent!';
      setTimeout(() => { RestartStatus.textContent = ''; }, 2000);
    })
    .catch(error => {
      console.error('Restart error:', error);
      RestartStatus.textContent = 'Error: ' + error.message;
    });
}

if (RestartButton) {
  RestartButton.addEventListener('click', sendRestartCommand);
}

// Send Values button handler
var SendValuesButton = document.querySelector('#send_values_button');
var SendValuesStatus = document.querySelector('#send_values_status');

function sendBiasVolt() {
  if (!BluetoothDevices || BluetoothDevices.length === 0) {
    SendValuesStatus.textContent = 'Not connected';
    return;
  }

  var inputVzero = document.querySelector('#input_biasVolt');
  var voltageValue = parseInt(inputVzero.value);

  if (isNaN(voltageValue)) {
    SendValuesStatus.textContent = 'Invalid value';
    return;
  }

  // // Convert to int16_t (multiply by 100 to convert volts to centivolts)
  // var intValue = Math.round(voltageValue * 100);
  var intValue = voltageValue;

  var device = BluetoothDevices[0];
  var serviceUUID = "0000ff10-0000-1000-8000-00805f9b34fb";
  var characteristicUUID = "0000ff11-0000-1000-8000-00805f9b34fb";

  device.gatt.connect()
    .then(server => server.getPrimaryService(serviceUUID))
    .then(service => service.getCharacteristic(characteristicUUID))
    .then(characteristic => {
      // Create 3-byte buffer: [0x01, int16_value]
      var buffer = new ArrayBuffer(3);
      var view = new DataView(buffer);
      view.setUint8(0, 0x01); // First byte = 0x01
      view.setInt16(1, intValue, true); // Followed by int16_t (little-endian)
      return characteristic.writeValue(buffer);
    })
    .then(() => {
      SendValuesStatus.textContent = 'Sent!';
      setTimeout(() => { SendValuesStatus.textContent = ''; }, 2000);
    })
    .catch(error => {
      console.error('Send voltage error:', error);
      SendValuesStatus.textContent = 'Error: ' + error.message;
    });
}

if (SendValuesButton) {
  SendValuesButton.addEventListener('click', sendBiasVolt);
}

// Utility functions
function registerBluetoothDataSource(BluetoothDataSourcesArray, BluetoothServiceUUID, BluetoothCharacteristicUUID, ValueHandler, TargetSelector, DataLog) {
  // Appends a data source, parser and target to the data sources list
  // ensure each source has a data log array to collect timestamped values when logging
  var log = DataLog;
  if (!log || !Array.isArray(log)) log = [];
  BluetoothDataSourcesArray.push({
    BluetoothServiceUUID: BluetoothServiceUUID,
    BluetoothCharacteristicUUID : BluetoothCharacteristicUUID,
    ValueHandler: ValueHandler,
    TargetSelector: TargetSelector,
    DataLog: log});
};

// Update or create a small element showing the last time a value was received.
function updateLastSeen(serviceUUID, charUUID) {
  // Prefer an existing element with id 'last_obs_time' (declared in the page)
  var el = document.querySelector('#last_obs_time') || document.getElementById('last_seen');
  var now = new Date();
  // var text = 'Last seen: ' + now.toLocaleString() + ' — ' + serviceUUID + ' / ' + charUUID;
  var text = now.toLocaleString();
  if (!el) {
    // fallback: create a small helper element if the page doesn't provide one
    el = document.createElement('div');
    el.id = 'last_seen';
    el.style.cssText = 'font-size:0.9em; color:#444; margin-top:6px;';
    var anchor = document.querySelector('#connect_button');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    } else {
      document.body.appendChild(el);
    }
  }
  el.textContent = text;
}

function connectBlueToothCharacteristic(BluetoothDevice, BluetoothServiceUUID, BluetoothCharacteristicUUID, ValueHandler, TargetSelector, DataLog){
  // Connects a bluetooth characteristic to a document and to a DataLog, which holds historic information
  console.log('Connecting bluetooth data source: ' + BluetoothServiceUUID + ', ' + BluetoothCharacteristicUUID)
  BluetoothDevice.gatt.connect()
      .then(server => server.getPrimaryService(BluetoothServiceUUID))
      .then(service => service.getCharacteristic(BluetoothCharacteristicUUID))
      .then(characteristic => characteristic.startNotifications())
      .then(characteristic => characteristic.addEventListener('characteristicvaluechanged', function(event){
        // call the existing handler to update the target element / data log
        try { ValueHandler(event, TargetSelector, DataLog); } catch (e) { console.error('ValueHandler error', e); }
        // update a visible "last seen" timestamp for this service/characteristic
        try { 
          var svc = String(BluetoothServiceUUID).toLowerCase();
          if (svc === '0000ff10-0000-1000-8000-00805f9b34fb' ) {
            updateLastSeen(BluetoothServiceUUID, BluetoothCharacteristicUUID);
          }
        } catch (e) { console.error('updateLastSeen error', e); }
      }))
      // .catch(error => {
      //   console.log('error:' + error);
      // });
};

ConnectSourceButton.addEventListener('click', function() {
  console.log('Requesting Bluetooth Service...')
  navigator.bluetooth.requestDevice({
    acceptAllDevices : true,
    // filters:[{name :'ESP32'}],
    optionalServices: [
      'battery_service',
      'generic_access',
      '0000180d-0000-1000-8000-00805f9b34fb', // 16-bit: Heart Rate (registered above)
      "0000ff10-0000-1000-8000-00805f9b34fb"
    ]
  })
  .then(device => {
    // Store device for later use (e.g., restart command)
    if (!BluetoothDevices.includes(device)) {
      BluetoothDevices.push(device);
    }
    BluetoothDataSources.forEach(source => {
      connectBlueToothCharacteristic(device, source.BluetoothServiceUUID, source.BluetoothCharacteristicUUID, source.ValueHandler, source.TargetSelector, source.DataLog);
    })
  })
  .catch(error => {
    console.log('error:' + error);
  });
});


// Bluetooth data handlers - these could be split up into more modular sub-capabilities
function blehandle_sint16(event, TargetSelector, DataLog) {
  const value = event.target.value.getInt16(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value / 100) ;
}

function blehandle_sint32(event, TargetSelector, DataLog) {
  console.log(event.target.value.byteLength)
  const value = event.target.value.getInt32(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value / 1000) ;
}

function blehandle_double(event, TargetSelector, DataLog) {
  console.log(event.target.value.byteLength)
  const value = event.target.value.getFloat64(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value.toFixed(6)) ;
}

function blehandle_float(event, TargetSelector, DataLog) {
  console.log(event.target.value.byteLength)
  const value = event.target.value.getFloat32(0, true);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value.toFixed(6)) ;
}


// Helper to download per-source logs as CSV files
function downloadDataLogs() {
  BluetoothDataSources.forEach(source => {
    var log = source.DataLog;
    if (!Array.isArray(log) || log.length === 0) return;
    // support entries with raw/filtered/average or legacy 'value'
    var rows = ['timestamp,raw,whitaker,filtered'];
    log.forEach(entry => {
      var rawVal = (entry.raw !== undefined) ? entry.raw : (entry.value !== undefined ? entry.value : '');
      var whitakerVal = (entry.whitaker !== undefined) ? entry.whitaker : '';
      var filteredavgVal = (entry.average !== undefined) ? entry.average : '';
      rows.push(String(entry.ts) + ',' + String(rawVal) + ',' + String(whitakerVal) + ',' + String(filteredavgVal));
    });
    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var svc = String(source.BluetoothServiceUUID).replace(/[^0-9a-zA-Z_-]/g, '_');
    var chr = String(source.BluetoothCharacteristicUUID).replace(/[^0-9a-zA-Z_-]/g, '_');
    if (source.BluetoothServiceUUID == "0000ff10-0000-1000-8000-00805f9b34fb") {
      svc = "measured_current";
    }
    a.download = svc + '_log.csv';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Start/Stop logging button behavior
if (StartStopLoggingButton) {
  StartStopLoggingButton.addEventListener('click', function() {
    isLogging = !isLogging;
    // update UI indicator

    if (isRecordingDisplay) isRecordingDisplay.textContent = isLogging ? 'Recording' : 'Paused';
    StartStopLoggingButton.textContent = isLogging ? 'Stop Logging' : 'Start Logging';
    if (!isLogging) {
      // when stopping, download logs
      try { 
        downloadDataLogs(); 
        // clear per-source DataLog buffers after download to free memory
        try {
          BluetoothDataSources.forEach(src => {
            if (src && Array.isArray(src.DataLog)) src.DataLog.length = 0;
          });
        } catch (e) { console.error('Clearing DataLog error', e); }
      } catch (e) { console.error('Download error', e); }
    }
  });
}


// Bluetooth data handlers - these could be split up into more modular sub-capabilities
function blehandle_sint16(event, TargetSelector, DataLog) {
  const value = event.target.value.getInt16(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value / 100) ;
  // log value if logging enabled and DataLog is present
  try {
    if (isLogging && Array.isArray(DataLog)) {
      DataLog.push({ ts: new Date().toISOString(), value: value / 100 });
    }
  } catch (e) { console.error('Logging error', e); }
}

function blehandle_sint32(event, TargetSelector, DataLog) {
  //console.log(event.target.value.byteLength)
  const value = event.target.value.getInt32(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value / 1000) ;
  try {
    if (isLogging && Array.isArray(DataLog)) {
      DataLog.push({ ts: new Date().toISOString(), value: value / 1000 });
    }
  } catch (e) { console.error('Logging error', e); }
}

function blehandle_double(event, TargetSelector, DataLog) {
  //console.log(event.target.value.byteLength)
  const value = event.target.value.getFloat64(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value.toFixed(6)) ;
  try {
    // logging will push raw/filtered/average after LP and average are computed
  } catch (e) { console.error('Logging error', e); }
}

function blehandle_float(event, TargetSelector, DataLog) {
  console.log(event.target.value.byteLength)
  // Support multiple Float32 samples in one characteristic notification.
  // The incoming DataView (event.target.value) may contain N*4 bytes where each 4 bytes is a float32 (little-endian).
  try {
    if (measuredCurrentChart && (TargetSelector === measuredCurrentDisplay || (TargetSelector && TargetSelector.id === 'measured_current'))) {
      var dv = event.target.value;
      var byteLen = dv.byteLength || 0;
      var floatSize = 4;
      var sampleCount = Math.floor(byteLen / floatSize);
      if (sampleCount <= 0) return;

      // Use a single timestamp for the batch, but make labels unique by appending index/ms
      var ts = new Date();
      var baseLabel = ts.toLocaleTimeString();
      var ms = ts.getMilliseconds();

      // Read all samples into an array so we can compute batch statistics (average) and then process each sample
      var samples = new Array(sampleCount);
      var batchSum = 0;
      for (var si = 0; si < sampleCount; si++) {
        samples[si] = dv.getFloat32(si * floatSize, true) * 1e3; // convert to nA
        batchSum += samples[si];
      }
      var batchAvg = batchSum / sampleCount;
      // Display the average of the batch in the textual target
      if (TargetSelector) {
        try { TargetSelector.textContent = String(batchAvg.toFixed(6)); } catch (e) {}
      }

      for (var si = 0; si < sampleCount; si++) {
        var raw = samples[si];

        var y = Number(raw);

        // Store raw data point
        measuredCurrentRawData.push(y);

        // Whitaker smoothing: compute smoothed value over last whitakerWindow raw points
        var sval = null;
        try {
          if (measuredCurrentRawData.length >= whitakerWindow) {
            var w = measuredCurrentRawData.slice(-whitakerWindow);
            var sm = whittakerSmooth(w, whitakerLambda, whitakerDifferences);
            sval = (Array.isArray(sm) && sm.length > 0) ? sm[sm.length - 1] : null;
            measuredCurrentChart.data.datasets[2].data.push( (sval !== null && sval !== undefined) ? sval : null );
          } else {
            // keep alignment with null until enough points
            measuredCurrentChart.data.datasets[2].data.push(null);
          }
        } catch (e) { console.error('Whitaker smoothing error', e); }

        // Input to low-pass filter is the Whitaker output when available, otherwise raw value
        var inputForLP = (sval !== null && sval !== undefined) ? sval : y;

        // Apply low-pass filter (exponential smoothing) to Whitaker output (or raw until window filled)
        var lp = inputForLP;
        if (measuredCurrentLPData.length > 0) {
          var prev = measuredCurrentLPData[measuredCurrentLPData.length - 1];
          lp = lpAlpha * inputForLP + (1 - lpAlpha) * prev;
        }
        measuredCurrentLPData.push(lp);

        // Create a unique label for each sample
        var label = baseLabel + '.' + (ms < 100 ? ('0' + ms) : ms) + (sampleCount > 1 ? ('_' + si) : '');
        measuredCurrentChart.data.labels.push(label);
        measuredCurrentChart.data.datasets[0].data.push(y);

        // Compute rolling average over last N filtered points (filtered now refers to LP applied to Whitaker)
        var avgWindow = 10;
        var startIdx = Math.max(0, measuredCurrentLPData.length - avgWindow);
        var sum = 0;
        var count = 0;
        for (var i = startIdx; i < measuredCurrentLPData.length; i++) {
          var v = measuredCurrentLPData[i];
          if (typeof v === 'number' && !isNaN(v)) { sum += v; count++; }
        }
        var averageValue = (count > 0) ? (sum / count) : null;
        measuredCurrentChart.data.datasets[1].data.push( (averageValue !== null) ? averageValue : null );

        // If logging is enabled, save raw, whitaker and average into the DataLog for this source
        try {
          if (isLogging && Array.isArray(DataLog)) {
            DataLog.push({ ts: new Date().toISOString(), raw: y, whitaker: (sval !== null && sval !== undefined) ? sval : null, average: (averageValue !== null) ? averageValue : null });
          }
        } catch (e) { console.error('Logging error (filtered)', e); }
      }

      // Trim to most recent N points (after adding the batch)
      var maxPoints = 2000;
      while (measuredCurrentChart.data.labels.length > maxPoints) {
        measuredCurrentChart.data.labels.shift();
        measuredCurrentChart.data.datasets[0].data.shift();
        measuredCurrentChart.data.datasets[1].data.shift();
        if (measuredCurrentChart.data.datasets[2]) measuredCurrentChart.data.datasets[2].data.shift();
        measuredCurrentRawData.shift();
        measuredCurrentLPData.shift();
      }

      // Update chart once per notification
      measuredCurrentChart.update();
    }
  } catch (e) { console.error('Chart update error', e); }
}