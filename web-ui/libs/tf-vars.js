module.exports = {
  provider: {gce: 'google', aws: 'amazon'},
  network: {gce: 'google_compute_network', aws: ''},
  subnetwork: {gce: 'google_compute_subnetwork', aws: ''},
  instance: {gce: 'google_compute_instance', aws: ''},
  firewall: {gce: 'google_compute_firewall', aws: ''},
  images: {
    gce: {
      'debian-8': 'https://www.googleapis.com/compute/v1/projects/debian-cloud/global/images/family/debian-8',
      'ubuntu-16.10': 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-1610',
      'windows-server-2008': 'https://www.googleapis.com/compute/v1/projects/windows-cloud/global/images/family/windows-2008-r2',
      'windows-server-2012': 'https://www.googleapis.com/compute/v1/projects/windows-cloud/global/images/family/windows-2012-r2',
      'windows-server-2016': 'https://www.googleapis.com/compute/v1/projects/windows-cloud/global/images/family/windows-2016'
    },
    aws: []
  },
  cores: {
    gce: {
      micro: 'f1-micro',
      small: 'g1-small',
      standard: 'n1-standard-1'
    },
    aws: {}
  },
  connections: ['ssh', 'vnc', 'rdp'],
  zones: {
    gce: ['europe-west1-b', 'asia-east1-a', 'asia-northeast1-a', 'us-central1-a', 'us-west1-a', 'us-east1-b'],
    aws: []
  },
  regions: {
    gce: ['europe-west1', 'asia-east1', 'asia-northeast1', 'us-central1', 'us-west1', 'us-east1'],
    aws: []
  },
  affectedZones: {
    gce: [0, 0, 0, 0, 0, 0],
    aws: []
  },
  maxPerZone: {gce: 8, aws: 0}
}
