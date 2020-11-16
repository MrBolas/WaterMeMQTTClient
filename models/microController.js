const mongoose = require('mongoose');

const microControllerSchema = mongoose.Schema({
    //_id: {type: Number, required: true},
    mac_address: {type: String, required: true},
    sensors: [{
        _id: false,
        type: {type: String, required: true},
        readings: [{
            _id: false,
            time: {type: String, required: true},
            value: {type: String, required: true}
        }]
    }],
});

module.exports = mongoose.model('MicroController', microControllerSchema);