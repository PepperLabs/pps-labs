const RSA = require('node-rsa')
const gce = require('@google-cloud/compute')

/**
  Get a compute object for communicating with the Compute Engine API.
  **/
function getCompute (projectId, keyFilename) {
  return gce({projectId, keyFilename})
}

/**
  Get the Google Compute Engine instance.
  **/
function getInstance (compute, instance, zone) {
  return compute.zone(zone).vm(instance)
}

/**
  Get the data for a Google Compute Engine instance.
  **/
function getInstanceData (vm) {
  return vm.getMetadata()
  .then((data) => {
    return data[0]
  })
}

/**
  Get an RSA key for encryption.
  **/
function getKey () {
  const key = new RSA().generateKeyPair()

  return key
}

/**
  Convert Int to base64 string
  **/
function numberToBase64 (x) {
  var bytes = []
  var i = 8
  do {
    bytes[--i] = x & (255)
    x = x >> 8
  } while (i)
  while (bytes[0] === 0) {
    bytes.shift()
  }
  return Buffer.from(bytes).toString('base64')
}

/**
  Remove the first bytes of a buffer if they equal 0
  **/
function stripLeadingZeros (buffer) {
  let tmp = Buffer.from(buffer)
  while (tmp[0] === 0) {
    tmp = tmp.slice(1)
  }
  return tmp
}

/**
  Return the public modulus and exponent for the key in base64 encoding.
  **/
function getModulusExponentInBase64 (key) {
  const components = key.exportKey('components-public')
  const exponent = numberToBase64(components.e)
  const modulus = stripLeadingZeros(components.n).toString('base64')

  return {exponent, modulus}
}

/**
  Return an RFC3339 UTC timestamp for 5 minutes from now
  **/
function getExpirationTimeString () {
  let expireOn = new Date()
  expireOn.setTime(expireOn.getTime() + 50000 * 60)
  expireOn = expireOn.toISOString()
  expireOn = expireOn.replace(/(\.[0-9]{1,5})Z/, 'Z')
}

/**
  Return the HSON string object that represents the windows-keys entry.
  **/
function getJsonString (user, modulus, exponent, email) {
  const expireOn = getExpirationTimeString()
  const data = {
    userName: user,
    modulus,
    exponent,
    expireOn,
    email
  }

  return JSON.stringify(data)
}

/**
  Return updated metadata contents with the new windows-keys entry.
  **/
function updateWindowsKeys (oldMetadata, metadataEntry) {
  let newMetadata = JSON.parse(JSON.stringify(oldMetadata))
  let found = false
  for (let i = 0; i < newMetadata.items.length; i++) {
    if (newMetadata.items[i].key === 'windows-keys') {
      newMetadata.items[i].value = metadataEntry
      found = true
    }
  }
  if (!found) {
    newMetadata.items.push({
      key: 'windows-keys',
      value: metadataEntry
    })
  }
  return newMetadata
}

/**
  Update the instance metadata.
  **/
function updateInstanceMetadata (vm, metadata) {
  return new Promise((resolve, reject) => {
    let metadataClean = []
    for (var i = 0; i < metadata.length; i++) {
      if (!metadata[i]['value']) continue
      metadataClean[metadata[i]['key']] = metadata[i]['value']
    }
    metadataClean['serial-port-enable'] = 'true'
    vm.setMetadata(metadataClean)
    .then((data) => {
      let operation = data[0]
      operation
      .on('complete', function () {
        resolve()
      })
    })
    .catch(reject)
  })
}

/**
  Reads Serial Port Output 4 every 5 seconds
  Tries 15 times to check output againt 'condition' function
  **/
function getSerialPortOutput (vm, condition) {
  return new Promise((resolve, reject) => {
    let tries = 0
    let max = 15

    function tryAgain () {
      tries++
      if (tries < max) {
        setTimeout(check, 5000)
        return true
      }
      return reject(new Error('Could not get Serial Port'))
    }

    function check () {
      vm.getSerialPortOutput(4)
      .then((data) => {
        let output = data[1]['contents']
        if (output === '') {
          return tryAgain()
        }
        let out = output.split('\n').reverse()
        for (let i = 0; i < out.length; i++) {
          try {
            let entry = JSON.parse(out[i])
            if (condition(entry)) {
              return resolve(entry)
            }
          } catch (e) {
            continue
          }
        }
        return tryAgain()
      })
    }

    check()
  })
}

/**
  Checks if Serial Port returns the 'ready' state
  **/
function checkSerialPortActivation (vm) {
  return getSerialPortOutput(vm, (entry) => entry['ready'] === true)
}

/**
  Find and return the correct encrypted password, based on the modulus.
  **/
function getEncryptedPasswordFromSerialPort (vm, modulus) {
  return getSerialPortOutput(vm, (entry) => modulus === entry['modulus'])
  .then((entry) => entry['encryptedPassword'])
}

/**
  Decrypt a base64 encoded encrypted password using the provided key.
  **/
function decryptPassword (encryptedPassword, key) {
  const encryptedPasswordBuffer = Buffer.from(encryptedPassword, 'base64')
  const clearPasswordBuffer = key.decrypt(encryptedPasswordBuffer)
  const password = clearPasswordBuffer.toString()
  return password
}

function newWindowsPassword ({instance, zone, project, user, email, keyFilename}) {
  // Setup
  const compute = getCompute(project, keyFilename)
  const key = getKey()
  const {modulus, exponent} = getModulusExponentInBase64(key)

  // Get existing metadata
  const vm = getInstance(compute, instance, zone)
  let oldMetadata
  return getInstanceData(vm)
  .then((metadata) => {
    oldMetadata = metadata['metadata']

    return checkSerialPortActivation(vm)
  })
  .then(() => {
    const metadataEntry = getJsonString(user, modulus, exponent, email)
    const newMetadata = updateWindowsKeys(oldMetadata, metadataEntry)
    return updateInstanceMetadata(vm, newMetadata.items)
  })
  .then(() => getEncryptedPasswordFromSerialPort(vm, modulus))
  .then((encryptedPassword) => decryptPassword(encryptedPassword, key))
  .then((password) => {
    console.log('username: ', user)
    console.log('password: ', password)
    return {username: user, password}
  })
}

module.exports = newWindowsPassword
