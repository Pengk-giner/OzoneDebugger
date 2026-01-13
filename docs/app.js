var BluetoothDataSources = [];
var BluetoothDevices = [];

// configure the buttons
var ConnectSourceButton = document.querySelector('#connect_button');
var StartStopLoggingButton = document.querySelector('#start_stop_logging_button');

// configure the display
var measuredCurrentDisplay = document.querySelector('#measured_current');
var measuredTempDisplay = document.querySelector('#measured_temperature');
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
          label: 'Baseline (airPLS)',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.05)',
          fill: false,
          pointRadius: 0,
          tension: 0.15,
          borderDash: [4, 4],
          hidden: true
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

// --- Baseline (airPLS) implementation (ported from Python) ---

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  var res = 1;
  for (var i = 1; i <= k; i++) {
    res = res * (n - (k - i)) / i;
  }
  return Math.round(res);
}

function solveLinear(A, b) {
  // Simple Gaussian elimination with partial pivoting (dense). A: array of arrays NxN, b: array length N
  var n = A.length;
  // copy
  var M = new Array(n);
  for (var i = 0; i < n; i++) { M[i] = A[i].slice(); }
  var B = b.slice();

  for (var k = 0; k < n; k++) {
    // pivot
    var maxRow = k;
    var maxVal = Math.abs(M[k][k]);
    for (var i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxVal) { maxVal = Math.abs(M[i][k]); maxRow = i; }
    }
    if (maxRow !== k) {
      var tmp = M[k]; M[k] = M[maxRow]; M[maxRow] = tmp;
      var tb = B[k]; B[k] = B[maxRow]; B[maxRow] = tb;
    }
    if (Math.abs(M[k][k]) < 1e-12) {
      // singular or ill-conditioned; fall back to returning b (no change)
      return b.slice();
    }
    for (var i = k + 1; i < n; i++) {
      var factor = M[i][k] / M[k][k];
      B[i] -= factor * B[k];
      for (var j = k; j < n; j++) {
        M[i][j] -= factor * M[k][j];
      }
    }
  }

  var x = new Array(n);
  for (var i = n - 1; i >= 0; i--) {
    var s = B[i];
    for (var j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function whittakerSmooth(x, w, lambda_, differences) {
  // x,w: arrays length m
  var m = x.length;
  if (m === 0) return [];
  var p = Math.max(1, differences || 1);
  if (m <= p) return x.slice();

  var rows = m - p;
  // compute forward difference coefficients for order p: c[k] = (-1)^k * C(p,k)
  var coeffs = [];
  for (var k = 0; k <= p; k++) coeffs.push((k % 2 === 0 ? 1 : -1) * binomial(p, k));

  // Build D^T * D (m x m)
  var DtD = new Array(m);
  for (var i = 0; i < m; i++) { DtD[i] = new Array(m).fill(0); }
  for (var i = 0; i < rows; i++) {
    for (var a = 0; a <= p; a++) {
      for (var b = 0; b <= p; b++) {
        DtD[i + a][i + b] += coeffs[a] * coeffs[b];
      }
    }
  }

  // Build A = diag(w) + lambda * DtD
  var A = new Array(m);
  var B = new Array(m);
  for (var i = 0; i < m; i++) {
    A[i] = new Array(m).fill(0);
    for (var j = 0; j < m; j++) A[i][j] = lambda_ * DtD[i][j];
    A[i][i] += (w && w[i] !== undefined) ? w[i] : 1.0;
    B[i] = ((w && w[i] !== undefined) ? w[i] : 1.0) * x[i];
  }

  var background = solveLinear(A, B);
  return background;
}

function airPLS(x, lambda_, porder, itermax) {
  var m = x.length;
  if (m === 0) return [];
  lambda_ = (lambda_ === undefined) ? 100 : lambda_;
  porder = (porder === undefined) ? 1 : porder;
  itermax = (itermax === undefined) ? 15 : itermax;

  var w = new Array(m).fill(1.0);
  var sumAbsX = 0;
  for (var i = 0; i < m; i++) sumAbsX += Math.abs(x[i]);

  var z = x.slice();
  for (var iter = 1; iter <= itermax; iter++) {
    z = whittakerSmooth(x, w, lambda_, porder);
    var d = new Array(m);
    for (var i = 0; i < m; i++) d[i] = x[i] - z[i];
    // sum of negative differences
    var dssn = 0;
    var dnegMax = -Infinity;
    for (var i = 0; i < m; i++) { if (d[i] < 0) { dssn += Math.abs(d[i]); if (d[i] > dnegMax) dnegMax = d[i]; } }
    if (dssn === 0 || dssn < 0.001 * sumAbsX || iter === itermax) {
      if (iter === itermax) console.warn('airPLS: max iteration reached');
      break;
    }
    for (var i = 0; i < m; i++) {
      if (d[i] >= 0) w[i] = 0; else w[i] = Math.exp(iter * Math.abs(d[i]) / dssn);
    }
    // endpoints
    if (dnegMax === -Infinity) dnegMax = 0;
    var endpointWeight = Math.exp(iter * Math.abs(dnegMax) / (dssn || 1));
    w[0] = endpointWeight; w[m - 1] = endpointWeight;
  }
  return z;
}

// --- UI handlers for baseline ---
try {
  var applyBaselineButton = document.getElementById('apply_baseline_button');
  var showBaselineCheckbox = document.getElementById('show_baseline_checkbox');
  var baselineLambdaInput = document.getElementById('baseline_lambda');
  var baselinePorderSelect = document.getElementById('baseline_porder');
  var baselineIterInput = document.getElementById('baseline_itermax');

  if (applyBaselineButton) {
    applyBaselineButton.addEventListener('click', function () {
      try {
        if (!measuredCurrentChart) return;
        var raw = measuredCurrentRawData.slice();
        if (!raw || raw.length === 0) return;
        var lambdaVal = Number(baselineLambdaInput && baselineLambdaInput.value) || 100;
        var porderVal = Number(baselinePorderSelect && baselinePorderSelect.value) || 1;
        var iterVal = Number(baselineIterInput && baselineIterInput.value) || 15;
        var baseline = airPLS(raw, lambdaVal, porderVal, iterVal);

        // Align baseline length with chart visible points
        var N = measuredCurrentChart.data.datasets[0].data.length;
        var baseToPlot = [];
        if (baseline.length >= N) baseToPlot = baseline.slice(baseline.length - N);
        else {
          // pad with nulls at front to match length
          var pad = new Array(Math.max(0, N - baseline.length)).fill(null);
          baseToPlot = pad.concat(baseline);
        }
        measuredCurrentChart.data.datasets[2].data = baseToPlot;
        measuredCurrentChart.update();
        // ensure checkbox shows the baseline if it's checked
        if (showBaselineCheckbox && showBaselineCheckbox.checked) {
          measuredCurrentChart.getDatasetMeta(2).hidden = false;
        }
      } catch (e) { console.error('Apply baseline error', e); }
    });
  }

  if (showBaselineCheckbox) {
    showBaselineCheckbox.addEventListener('change', function () {
      if (!measuredCurrentChart) return;
      var hidden = !showBaselineCheckbox.checked;
      measuredCurrentChart.data.datasets[2].hidden = hidden;
      measuredCurrentChart.update();
    });
  }
} catch (e) { console.error('Baseline UI init error', e); }

// Store raw data for filtering
var measuredCurrentRawData = [];
// Low-pass filtered data (for averaging)
var measuredCurrentLPData = [];
// LP filter alpha (0..1). Smaller alpha -> smoother (slower) response.
var lpAlpha = 0.2; // adjust as desired

// Register bluetooth data sources, connect to parsers and display elements
registerBluetoothDataSource(BluetoothDataSources, "0000ff10-0000-1000-8000-00805f9b34fb", "0000ff12-0000-1000-8000-00805f9b34fb", blehandle_float, measuredCurrentDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, measuredTempDisplay, '')

// logging state
var isLogging = false;

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
    var rows = ['timestamp,raw,filtered'];
    log.forEach(entry => {
      var rawVal = (entry.raw !== undefined) ? entry.raw : (entry.value !== undefined ? entry.value : '');
      var filteredavgVal = (entry.average !== undefined) ? entry.average : '';
      rows.push(String(entry.ts) + ',' + String(rawVal) + ',' + String(filteredavgVal));
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
  const value = event.target.value.getFloat32(0, true);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value.toFixed(6)) ;
  // logging of raw/filtered values is handled after filtering so entries include both
  // Update live chart if this target is the measured-current display
  try {
    if (measuredCurrentChart && (TargetSelector === measuredCurrentDisplay || (TargetSelector && TargetSelector.id === 'measured_current'))) {
      var ts = new Date();
      var label = ts.toLocaleTimeString();
      var y = Number(value.toFixed(6));

      // Store raw data point
      measuredCurrentRawData.push(y);

      // Apply low-pass filter (exponential smoothing) before averaging
      var lp = y;
      if (measuredCurrentLPData.length > 0) {
        var prev = measuredCurrentLPData[measuredCurrentLPData.length - 1];
        lp = lpAlpha * y + (1 - lpAlpha) * prev;
      }
      measuredCurrentLPData.push(lp);

      // Add raw point to chart
      measuredCurrentChart.data.labels.push(label);
      measuredCurrentChart.data.datasets[0].data.push(y);

      // Compute rolling average of last N filtered (LP) points and add to the average dataset
      var avgWindow = 10;
      var startIdx = Math.max(0, measuredCurrentLPData.length - avgWindow);
      var sum = 0;
      var count = 0;
      for (var i = startIdx; i < measuredCurrentLPData.length; i++) {
        var v = measuredCurrentLPData[i];
        if (typeof v === 'number' && !isNaN(v)) { sum += v; count++; }
      }
      var averageValue = (count > 0) ? (sum / count) : null;
      // push numeric average or null if no data
      measuredCurrentChart.data.datasets[1].data.push( (averageValue !== null) ? averageValue : null );

      // If logging is enabled, save raw, filtered and average into the DataLog for this source
      try {
        if (isLogging && Array.isArray(DataLog)) {
          DataLog.push({ ts: new Date().toISOString(), raw: y, average: (averageValue !== null) ? averageValue : null });
        }
      } catch (e) { console.error('Logging error (filtered)', e); }

      // keep only the most recent N points
      var maxPoints = 200;
        if (measuredCurrentChart.data.labels.length > maxPoints) {
          measuredCurrentChart.data.labels.shift();
          measuredCurrentChart.data.datasets[0].data.shift();
          measuredCurrentChart.data.datasets[1].data.shift();
          measuredCurrentRawData.shift();
          measuredCurrentLPData.shift();
        }
      measuredCurrentChart.update();
    }
  } catch (e) { console.error('Chart update error', e); }
}