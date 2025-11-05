# Web Bluetooth Toolbox

## Important to know before you start

Web Bluetooth is an experimental technology, currently it is supported only by a handful of browsers and not on all operating systems, [this link gives the details](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility). As a consequence it is necessary to make a few small configuration tweaks before you try to connect.

I chose **Google Chrome** as it has the best support overall and Google are pushing Web Bluetooth quite hard.

I have tested the example using the following browers + operating systems:
- MacOS 
  - Monterey running on Macbook Pro 13" 2016
  - Google Chrome browser (Safari will not work)
- iOS
  - iOS 16.0 beta running on iPhone 12 Pro Max
  - Bluefy browser (Safari, Chrome iOS will not work)
- Windows
  - laptop running Windows 10
  - Google Chrome browser

**Pre-configuration steps**
1. Allow Chrome on your device to use Bluetooth. On MacOS I had to do this by adding Google Chrome.app to the list of apps with Bluetooth access. You will find this in _System Preferences_ under _Security & Privacy_. I didn't need to do this on my Windows 10 machine. 
2. In Chrome you need to enable the _Bluetooth Scanning_ feature using this URI `chrome://settings/content/bluetoothScanning`
 
Check that your Bluetooth adapter is turned on and that Google Chrome can access Bluetooth and do a trial scan by visiting `chrome://bluetooth-internals/#devices`. If this shows up a list of devices (almost guaranteed unless you live in the stone ages) then you should be set for the rest of the example to work. 

### Requirements

I built this example using the following hardware and software. 

#### Web server
- python 3.10
- flask - for the web server `pip3 install flask`
- pyopenssl - for adhoc ssl certificates `pip3 install pyopenssl`

## Architecture of the example

### Web page + Bluetooth client
The web page is a simple template, populated initially with placeholders. 

The _Connect_ button triggers user authorisation of the Bluetooth scan and device connection. Once connection is achieved elements of the web page are populated with data from the Bluetooth device. Call back handlers ensure that these are automatically updated based on the embedded device notification / emulated sensor frequency. 

The javascript is somewhat abstracted making it simple to register a new bluetooth characteristic to read and connect this to a data parser and element of the HTML DOM to update with the received value. This part is a useful stub for quickly prototyping features and which I have used in my own work. 

## Installing the example and running it

### Web server - Flask method
Open a terminal at the example root directory and run `python3 app.py`. This will launch the web app on host addresses `0.0.0.0`. As such it should be accessible 
**For security reasons** - only run the example this way if you are behind an adequate firewall! If you only want to only access from localhost then change the run configuration. 

To connect open Google Chrome browser and navigate to one of the two links which flask prints in the terminal. Make sure you use https://

Note that since you are using an adhoc SSL certificate Chrome will complain and you will need to explicitly complete navigation to the webpage. 

### Web server - Github pages method
Simply navigate here in Google Chrome (iOS, Android, Bluefy) or other web bluetooth compatible browser.

https://pengk-giner.github.io/OzoneDebugger/

### Running the example
1. Click on the _Connect_ button
2. Identify your ESP32 device in the Chrome popup Bluetooth device scan
3. Watch as the Placeholder values get updated with dummy data!  

If everything is working correctly you should see something like the image at the top of the page.


### Troubleshooting
If things don't work as expected you may find helpful messages / errors being printed to the console. Most common problems / solutions I have found include:

**Chrome can't see the Bluetooth device** - check authorizations for your operating system 

**Chrome Bluetooth is not enabled** - check steps above / google

**Flask / other host is not serving as **HTTPS**** - it seems that there are no errors, Chrome just refuses to run the connection routines, unhelpful! 
 
**SSL certificates are corrupted / invalid** - should not happen when using an adhoc certificate but I had many problems with self-signed certificates