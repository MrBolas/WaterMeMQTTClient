const environment_v = require('dotenv').config()
const mongoose = require('mongoose');
const MicroController = require('@mrballs/watermesettings');
var mqtt = require('mqtt');
require('log-timestamp');

const main_topic = "WaterMe";

mongoose.set('useFindAndModify', false);
//mongoose.set('debug', true);

mongoose.connect(`mongodb://${process.env.DB_HOST}:27017/WaterMe`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log(`Connected to Database: mongodb://${process.env.DB_HOST}:27017/WaterMe`)
})
.catch(() => {
  console.log(`Connection to Database failed: mongodb://${process.env.DB_HOST}:27017/WaterMe`)
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("Database connected.")
});


function getSensorThresholds(received_message) {
  
  let watering_threshold = {
    max: 100,
    min: 0
  } 
  // Setup sensor threshold
  if (received_message.type.includes('temp')) {
    //thresholds for temperature sensor
    watering_threshold.max = 23;
    watering_threshold.min = 13;
  }
  else if(received_message.includes('DHT'))
  {
    //thresholds for humidity sensor
    watering_threshold.max = 80;
    watering_threshold.min = 0;
  }
  else if( received_message.type.includes('SMS'))
  {
    //thresholds for Soil Moisture Sensor
    watering_threshold.max = 1;
    watering_threshold.min = 2;
  }

  return watering_threshold;
}



//var client  = mqtt.connect("mqtt://test.mosquitto.org",{port:1883});
var client  = mqtt.connect(`mqtt://${process.env.MQTT_BROKER}`,{port:1883});

client.on("connect",function(){	
  client.subscribe(main_topic, function (err) {
    if (!err) {
      console.log('WaterMe subscribed');
      client.publish(main_topic, 'MQTT Server worker subscribed');
    }
  })
})

client.on('message', function (topic, message) {
  // message is Buffer
  console.log(`${topic} ${message}`)

  if (topic == "WaterMe") {
    client.subscribe(message.toString(), function (err) {
      if (!err) {
        console.log(`${message.toString()} Subscribed.`);
        //client.publish(temperature_topic, 'Received Temperature')
      }
    })
  }

  let received_sensor_register;
  /*
  let received_sensor_register = {
    mac_address: <>,
    type: <>,
    value: <>,
    time: <>
  };
  */

  try{
    received_sensor_register = JSON.parse(message);
  } catch (err) {
    console.log(`${err} : ${message}`);
    return;
  }

  MicroController.findOne({mac_address: received_sensor_register.mac_address})
  .then(controller => {
    //if cant find controller
    if (controller == null) {

      // Gets watering thresholds for the respective sensor
      let watering_threshold = getSensorThresholds(received_sensor_register);

      //if did not found controller => create controller in the dB
      let new_controller = new MicroController({
        mac_address: received_sensor_register.mac_address,
        sensors: {
          type: received_sensor_register.type,
          watering_threshold,
          readings: {
            time: received_sensor_register.time,
            value: received_sensor_register.value
          }
        }
    })
      // saves new controller in database
      new_controller.save();
      return;
    }
    //Update
    else if (controller.sensors.some(sensor => sensor.type == received_sensor_register.type))
    {
      let controller_sensors = controller.sensors;

      for (let sensor of controller_sensors) {
        if (sensor.type == received_sensor_register.type) {
          sensor.readings.push({
            time: received_sensor_register.time,
            value: received_sensor_register.value
          })
          //console.log(`Added new Sensor Reading for Sensor: ${sensor.type}`);
        }
      }
      //update dB with sensor readings
      MicroController.findOneAndUpdate({mac_address: received_sensor_register.mac_address}, {sensors: controller_sensors})
      .catch( err => {
        console.log("New sensor readings failure");
        console.log(err);
      })
    }else
    {
      let controller_sensors = controller.sensors;

      // Gets watering thresholds for the respective sensor
      let watering_threshold = getSensorThresholds(received_sensor_register);

      let new_sensor = {
        type: received_sensor_register.type,
        watering_threshold,
        readings: {
          time: received_sensor_register.time,
          value: received_sensor_register.value
        }
      }
      controller_sensors.push(new_sensor); 

      //update dB with new sensor
      MicroController.findOneAndUpdate({mac_address: controller.mac_address}, {sensors: controller_sensors},{new: true})
      .catch( err => {
        console.log("New sensor failure");
        console.log(err);
      })
    }
  })
  .catch(err => {
    console.log(err);
  })
})

//handle errors
client.on("error",function(error){
  console.log("Can't connect" + error);
  process.exit(1)});
