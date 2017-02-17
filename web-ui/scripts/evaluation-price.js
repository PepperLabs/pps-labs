const request = require('request')

/*
  instances {
  machineType: 'small',
  image: 'win',
  region: 'us/asia',
  storage_type: 'hdd',
  storage_size: 1,
  price:
  }
*/

function getLabPrice (instances) {
  return new Promise((resolve, reject) => {
    request('https://cloudpricingcalculator.appspot.com/static/data/pricelist.json', function (err, data, body) {
      if (err) throw err
      let price = JSON.parse(body)
      let priceOS = price['gcp_price_list']['CP-COMPUTEENGINE-OS']
      let priceCapacity = price['gcp_price_list']['CP-COMPUTEENGINE-STORAGE-PD-CAPACITY']
      let priceSSD = price['gcp_price_list']['CP-COMPUTEENGINE-STORAGE-PD-SSD']
      for (let i = 0; i < instances.length; i++) {
        var total = 0
        if (instances[i].image.indexOf('windows') !== -1) { // c'est windows
          if (instances[i].machineType.indexOf('small') !== -1 || instances[i].machineType.indexOf('micro') !== -1) { // small or micro
            if (instances[i]['storage_type'].indexOf('hdd') !== -1) { // hdd
              total += priceOS.win.low + priceCapacity[instances[i].region] * instances[i].storage_size
            } else {
              total += priceOS.win.low + priceSSD[instances[i].region] * instances[i].storage_size
            }
          } else {
            if (instances[i]['storage_type'].indexOf('hdd') !== -1) { // hdd
              total += priceOS.win.high + priceCapacity[instances[i].region] * instances[i].storage_size
            } else {
              total += priceOS.win.high + priceSSD[instances[i].region] * instances[i].storage_size
            }
          }
        } else { // Linux donc gratos
          if (instances[i]['storage_type'].indexOf('hdd') !== -1) { // hdd
            total += priceCapacity[instances[i].region] * instances[i].storage_size
          } else {
            total += priceSSD[instances[i].region] * instances[i].storage_size
          }
        }
        instances[i].price = total
      }
      return resolve(instances)
    })
  })
}
/*
getLabPrice([
  {
    'machineType': 'small',
    'image': 'windows-server-2016',
    'region': 'us',
    'storage_type': 'hdd',
    'storage_size': 1
  }, {
    'machineType': 'small',
    'image': 'windows-server-2016',
    'region': 'us',
    'storage_type': 'hdd',
    'storage_size': 1
  }
])
.then((instances) => {
  console.log('appel de la fonction : ', instances)
})
*/
module.exports = getLabPrice
