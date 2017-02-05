module.exports = {
  provider: {gce: 'google', aws: 'amazon'},
  network: {gce: 'google_compute_network', aws: ''},
  subnetwork: {gce: 'google_compute_subnetwork', aws: ''},
  instance: {gce: 'google_compute_instance', aws: ''},
  images: {
    gce: [],
    aws: []
  },
  cores: {
    gce: {
      micro: 'f1-micro',
      standard: 'n1-standard-1'
    },
    aws: {}
  },
  connections: ['ssh', 'vnc', 'rdp'],
  zones: {
    gce: ['asia-east1-a', 'asia-northeast1-a', 'us-central1-a', 'us-west1-a', 'europe-west1-b', 'us-east1-b'],
    aws: []
  },
  affectedZones: {
    gce: [0, 0, 0, 0, 0, 0],
    aws: []
  },
  maxPerZone: {gce: 8, aws: 0}
}
