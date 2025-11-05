var BluetoothDataSources = [];
var BluetoothDevices = [];

// configure the buttons
var ConnectSourceButton = document.querySelector('#connect_button');

// configure the display
var windSpeedDisplay = document.querySelector('#wind_speed');
var windAngleDisplay = document.querySelector('#wind_angle');
var longitudeDisplay = document.querySelector('#gps_lon');
var latitudeDisplay = document.querySelector('#gps_lat');

var speedDisplay = document.querySelector('#speed');
var maxSpeedDisplay = document.querySelector('#max_speed');
var distanceDisplay = document.querySelector('#distance');
var headingDisplay = document.querySelector('#heading');
var isRecordingDisplay = document.querySelector('#is_recording');

var lastSeen = document.querySelector('#last_obs_time');

// Register bluetooth data sources, connect to parsers and display elements
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, windSpeedDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a39-0000-1000-8000-00805f9b34fb", blehandle_sint16, windAngleDisplay, '')

registerBluetoothDataSource(BluetoothDataSources, "0000180a-0000-1000-8000-00805f9b34fb", "00002a29-0000-1000-8000-00805f9b34fb", blehandle_double, latitudeDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180a-0000-1000-8000-00805f9b34fb", "00002a24-0000-1000-8000-00805f9b34fb", blehandle_double, longitudeDisplay, '')

registerBluetoothDataSource(BluetoothDataSources, "0000ff10-0000-1000-8000-00805f9b34fb", "0000ff12-0000-1000-8000-00805f9b34fb", blehandle_float, speedDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000ff10-0000-1000-8000-00805f9b34fb", "0000ff11-0000-1000-8000-00805f9b34fb", blehandle_float, maxSpeedDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, distanceDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, headingDisplay, '')
registerBluetoothDataSource(BluetoothDataSources, "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", blehandle_sint16, isRecordingDisplay, '')

// Utility functions
function registerBluetoothDataSource(BluetoothDataSourcesArray, BluetoothServiceUUID, BluetoothCharacteristicUUID, ValueHandler, TargetSelector, DataLog) {
  // Appends a data source, parser and target to the data sources list
  BluetoothDataSourcesArray.push({
    BluetoothServiceUUID: BluetoothServiceUUID,
    BluetoothCharacteristicUUID : BluetoothCharacteristicUUID,
    ValueHandler: ValueHandler,
    TargetSelector: TargetSelector,
    DataLog: DataLog});
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
    // filters:[{services :["90D3D000-C950-4DD6-9410-2B7AEB1DD7D8".toLowerCase()]}],
    // Include any services we'll call getPrimaryService() for so the origin is allowed to access them
    optionalServices: [
      'battery_service',
      'generic_access',
      'environmental_sensing',
      '0000180d-0000-1000-8000-00805f9b34fb', // 16-bit: Heart Rate (registered above)
      '0000180a-0000-1000-8000-00805f9b34fb', // 16-bit: Device Information (registered above)
      "0000ff10-0000-1000-8000-00805f9b34fb",
      "90D3D000-C950-4DD6-9410-2B7AEB1DD7D8".toLowerCase()
    ]
  })
  .then(device => {
    BluetoothDataSources.forEach(source => {
      connectBlueToothCharacteristic(device, source.BluetoothServiceUUID.toLowerCase(), source.BluetoothCharacteristicUUID.toLowerCase(), source.ValueHandler, source.TargetSelector, source.DataLog);
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
  //console.log(event.target.value.byteLength)
  const value = event.target.value.getInt32(0, false);
  //console.log('Received: ' + value);
  TargetSelector.textContent = String(value / 1000) ;
}

function blehandle_double(event, TargetSelector, DataLog) {
  //console.log(event.target.value.byteLength)
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