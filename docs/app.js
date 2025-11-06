var BluetoothDataSources = [];
var BluetoothDevices = [];

// configure the buttons
var ConnectSourceButton = document.querySelector('#connect_button');
var StartStopLoggingButton = document.querySelector('#start_stop_logging_button');

// configure the display
var measuredCurrentDisplay = document.querySelector('#measured_current');
var ozoneAQIDisplay = document.querySelector('#ozone_aqi');
var longitudeDisplay = document.querySelector('#gps_lon');
var latitudeDisplay = document.querySelector('#gps_lat');
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

// Register bluetooth data sources, connect to parsers and display elements
registerBluetoothDataSource(BluetoothDataSources, "0000ff10-0000-1000-8000-00805f9b34fb", "0000ff12-0000-1000-8000-00805f9b34fb", blehandle_float, measuredCurrentDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, ozoneAQIDisplay, '')

registerBluetoothDataSource(BluetoothDataSources, 'environmental_sensing', 'latitude', blehandle_double, latitudeDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, 'environmental_sensing', 'longitude', blehandle_double, longitudeDisplay, '')


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
      'environmental_sensing',
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
    var rows = ['timestamp,value'];
    log.forEach(entry => {
      // escape values if needed
      rows.push(String(entry.ts) + ',' + String(entry.value));
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
      try { downloadDataLogs(); } catch (e) { console.error('Download error', e); }
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
    if (isLogging && Array.isArray(DataLog)) {
      DataLog.push({ ts: new Date().toISOString(), value: Number(value.toFixed(6)) });
    }
  } catch (e) { console.error('Logging error', e); }
}

function blehandle_float(event, TargetSelector, DataLog) {
  console.log(event.target.value.byteLength)
  const value = event.target.value.getFloat32(0, true);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value.toFixed(6)) ;
  try {
    if (isLogging && Array.isArray(DataLog)) {
      DataLog.push({ ts: new Date().toISOString(), value: Number(value.toFixed(6)) });
    }
  } catch (e) { console.error('Logging error', e); }
  // Update live chart if this target is the measured-current display
  try {
    if (measuredCurrentChart && (TargetSelector === measuredCurrentDisplay || (TargetSelector && TargetSelector.id === 'measured_current'))) {
      var ts = new Date();
      var label = ts.toLocaleTimeString();
      var y = Number(value.toFixed(6));
      measuredCurrentChart.data.labels.push(label);
      measuredCurrentChart.data.datasets[0].data.push(y);
      // keep only the most recent N points
      var maxPoints = 200;
      if (measuredCurrentChart.data.labels.length > maxPoints) {
        measuredCurrentChart.data.labels.shift();
        measuredCurrentChart.data.datasets[0].data.shift();
      }
      measuredCurrentChart.update();
    }
  } catch (e) { console.error('Chart update error', e); }
}