#!/bin/bash

#creation de la classe

if [ "$#" -eq 0 ] || [ "$1" == "-h" ]
then
	clear
cat | more << 'EOF'

░█▀▀░█▀▄░█░█░█▀▀░█░░░█▀█░█░█░█▀▄░░░█░█░▀▀█
░█▀▀░█░█░█░█░█░░░█░░░█░█░█░█░█░█░░░▀▄▀░░▀▄
░▀▀▀░▀▀░░▀▀▀░▀▀▀░▀▀▀░▀▀▀░▀▀▀░▀▀░░░░░▀░░▀▀░

EDUCLOUD V3 - Instances provision - MANPAGE
by RemsFlems - remi.viard@gmail.com

usage: classinit.bash <students_number> <project> <Reserved> <lab_name> <OS1> [OS2] [OSn]

examples:

bash classinit.bash 1 pfe-test helloworld labdev debian-cloud/debian-8

bash classinit.bash 5 pfe-test random? labdns debian-cloud/debian-8 ubuntu-os-cloud/ubuntu-1604-lts

bash classinit.bash 10 pfe-test randomtext123 firstlab debian-cloud/debian-8 ubuntu-os-cloud/ubuntu-1604-lts windows-cloud/windows-2016



-------------INTRO-------------

This script allow anybody to make provision of instances groups
duplicated as wishes (for every students required)
 
Make sure that binary terraform is right installed,
and having valid .json authorization file.

This script was tested for Google Cloud Compute provisionner
and may not work properly for others.

-------------USAGE-------------

This script require, at least, 5 arguments to work properly.
<arg> are required arguments
[arg] are optionnal arguments

usage: classinit.bash <students_number> <project> <Reserved> <lab_name> <OS1> [OS2] [OSn]

<students_number>	This argument require an integer, minimum value : 1 
			and will tell how much time need the infrastructure 
			(The Labs) to be  duplicated. It will also serve at
			setting prefix names of each instance. So, instances
			prefix will be like : eleve1, eleve2, eleve3 etc...
			This argument is mandatory for this script.

<project>		This argument is a string, example : pfe-test 
			it must correspond to a valid project name inside
			your Google Cloud Compute architecture.
			This argument is mandatory for this script.

<Reserved>		This argument is a string, exemple : random123
			For the moment, it's a totally useless argument which
			can be set at any string value that you wish and
			will not impact on the result of the script. This
			argument is reserved for further uses.
			This argument is mandatory for this script.

<lab_name> 		This argument is a string, exemple : labdev
			NO UPPER-CASE ALLOWED!! numbers may not be necessary
			but allowed. This argument serve at prefixe name for
			instances generated. If a Lab is composed of 3 
			instances. Names will be: labdev1, labdev2, labdev3.
			According to students_number values, instances real
			names will be: eleve1labdev1, eleve1labdev2, eleve1labdev3, 
			eleve2labdev1, eleve2labdev2, eleve2labdev3, etc...
			This argument is mandatory for this script.

<OS1>			This argument is a string, exemple : debian-cloud/debian-8
			It specifie which operating system will be built 
			into an instance. There are a lot of OS allowed,
			and full list can be shown here :
			https://cloud.google.com/compute/docs/images#image_families
			This argument is mandatory for this script.

[OS2] [OS3]...		A lab can be composed of more than one instance and
			various operating system. Just add new instances with
			specific OS by adding an optionnal parameter, which
			have to fit same properties than <OS1>.	
			That arguments are optionnal for this script.

EOF
	exit 0
fi

if [ "$#" -lt 5 ]
then
	echo "bad run"
	echo "usage: classinit.bash <students_number> <project> <Reserved> <lab_name> <OS1> [OS2] [OSn]"
	echo "See HELP by typing: classinit.bash -h"
	exit 0
fi

rm -rf eleve*
rm -rf guacserver
rm -rf netinit

mkdir guacserver

ftpserver="10.128.0.6"

#creation cle privee/public avec ssh-keygen et envoie cle privee dans guac, et envoi cle publique dans les machines guac.
rm -rf ~/.ssh/id_rsa
rm -rf ~/.ssh/id_rsa.pub
cat /dev/zero | ssh-keygen -q -N "" 
theprivatekey=`cat ~/.ssh/id_rsa`

#mettre public key dans authorized host des machines cibles
thepublickey=`cat ~/.ssh/id_rsa.pub`

rm -rf user-mapping.xml
touch user-mapping.xml

#on recupere les types de processeurs
prococpt=0
while read line
do
	processor[$prococpt]=$line
	((prococpt++))
done < list_processors


#on recupere les types d'acces
accesscpt=0
while read line
do
	accessors[$accesscpt]=$line
	((accesscpt++))
done < list_access

#zone
zones_names=( "asia-east1-a" "asia-northeast1-a" "us-central1-a" "us-west1-a" "europe-west1-b" "us-east1-b")
regions_names=( "asia-east1" "asia-northeast1" "us-central1" "us-west1" "europe-west1" "us-east1")
zones_count=( "0" "0" "0" "0" "0" "0" )
zones_max_size=8
zones_current=0

#network
network="192.168."
mkdir netinit
mkdir netinit/firewall
cat << 'EOF' > netinit/lab_gen.tf
provider "google" {
	credentials = "${file("../Educloud-906c241f7b12.json")}"
EOF

cat << EOF >> netinit/lab_gen.tf
	project = "$2"
	region = "${zones_names[$zones_current]}"
}
EOF

cat << EOF >> netinit/lab_gen.tf
resource "google_compute_network" "net$4" {
  name                    = "net$4"
  auto_create_subnetworks = "false"
}
EOF

#firewall rules
cat << 'EOF' > netinit/firewall/lab_gen.tf
provider "google" {
	credentials = "${file("../../Educloud-906c241f7b12.json")}"
EOF

cat << EOF >> netinit/firewall/lab_gen.tf
	project = "$2"
	region = "europe-west1-b"
}
resource "google_compute_firewall" "firewall-$4" {
  name    = "firewall-$4"
  network = "net$4"

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports = ["22"]
  }

 source_ranges = ["74.125.73.0/24"]
}
EOF


#entete user eleve pour machine guac dans user-mapping.xml
cat << EOF >> user-mapping.xml
<user-mapping>
EOF

#eleves
for nbreleve in `seq 1 $1`
do
	mkdir "eleve$nbreleve"
	

#creation du lab
#entetes des fichiers .tf

cat << 'EOF' > eleve$nbreleve/lab_gen.tf
provider "google" {
	credentials = "${file("../Educloud-906c241f7b12.json")}"
EOF

cat << EOF >> eleve$nbreleve/lab_gen.tf
	project = "$2"
	region = "europe-west1-b"
}
EOF

#definition du subnet de chaque eleve. ajouté dans le script .tf de netinit
cat << EOF >> netinit/lab_gen.tf
resource "google_compute_subnetwork" "subnet$4-$nbreleve" {
  name          = "subnet$4-$nbreleve"
  ip_cidr_range = "$network$nbreleve.0/24"
  network       = "\${google_compute_network.net$4.self_link}"
  region        = "${regions_names[$zones_current]}"
}
EOF

#firewall provision
cat << EOF >> netinit/firewall/lab_gen.tf
resource "google_compute_firewall" "default-allow-internal-subnet$4-$nbreleve" {
  name    = "default-allow-internal-subnet$4-$nbreleve"
  network = "net$4"

 allow {
   protocol = "icmp"
 }

 allow {
   protocol = "tcp"
   ports = ["0-65535"]
 }

 allow {
   protocol = "udp"
   ports = ["0-65535"]
 }

 source_ranges = ["$network$nbreleve.0/24"]
 target_tags   = ["subnet$4-$nbreleve"]
}
EOF

#entete user eleve pour machine guac dans user-mapping.xml
cat << EOF >> user-mapping.xml
  <authorize username="eleve$nbreleve" password="eleve$nbreleve">
EOF

#création des instances
cpt=1
prococpt=0
accesscpt=0
args=("$@")
for nbrinst in `seq 5 $#`
do

instanceip=$(( $cpt + 1 ))
if [ "${zones_count[$zones_current]}" -lt "$zones_max_size" ]
then
	((zones_count[zones_current]++))
else
	((zones_current++))
fi

cat << EOF >> eleve$nbreleve/lab_gen.tf
resource "google_compute_instance" "eleve$nbreleve$4$cpt" {
  name         = "eleve$nbreleve$4$cpt"
  machine_type = "${processor[$prococpt]}"
  zone         = "${zones_names[$zones_current]}"
  tags         = ["subnet$4-$nbreleve"]
  disk 
  {
    image = "${args[((nbrinst-1))]}"
  }
  network_interface 
  {
    subnetwork = "subnet$4-$nbreleve"
    address = "$network$nbreleve.$instanceip"
    access_config 
    {
      // Ephemeral IP
    }
  }
  metadata 
  {
    foo = "bar"
    created-by = "remsgroup"
    reserved-useless = "$3"
  }
EOF


#Installation des SSH/VNC/RDP en fonction de la machine (si windows : RDP , sinon : SSH+VNC)
if [ "${accessors[$accesscpt]}" == "rdp" ]
then
	##echo "rdp-----------------------"
	echo "implementer meta-startup-script pour rdp"	
elif [ "${accessors[$accesscpt]}" == "vnc" ]
then
	echo "implementer meta-startup-script pour vnc"
cat << EOF >> eleve$nbreleve/lab_gen.tf
  metadata_startup_script = "sudo apt-get --yes --force-yes install tightvncserver && echo root:root | sudo chpasswd && sudo echo fini > /fini.txt"
EOF

else

cat << EOF >> eleve$nbreleve/lab_gen.tf
  metadata_startup_script = "sudo apt-get --yes --force-yes install openssh-server && echo root:root | sudo chpasswd && sudo echo fini > /fini.txt"
EOF

#fichier temp des acces pour la machine guac en ssh + envoi cle privee
cat << EOF >> user-mapping.xml
    <connection name="ssh_guacamole">
      <protocol>ssh</protocol>
      <param name="hostname">$network$nbreleve.$instanceip</param>
      <param name="port">22</param>
      <param name="private-key">$theprivatekey</param>
      <param name="server-layout">fr-fr-azerty</param>
      <param name="color-depth">16</param>
    </connection>
EOF

fi



cat << EOF >> eleve$nbreleve/lab_gen.tf
  service_account 
  {
    scopes = ["userinfo-email", "compute-ro", "storage-ro"]
  }
}

EOF

((cpt++))
((prococpt++))
((accesscpt++))
done #fin du for nbrinst

#fin de l'entete user eleve pour la machine guac
cat << EOF >> user-mapping.xml
 </authorize>
EOF

done #fin du for nbreleve

#fin de l'entete user eleve pour la machine guac
cat << EOF >> user-mapping.xml
</user-mapping>
EOF

#guacamole instance

cat << 'EOF' > guacserver/lab_gen.tf
provider "google" {
	credentials = "${file("../Educloud-906c241f7b12.json")}"
EOF

cat << EOF >> guacserver/lab_gen.tf
	project = "$2"
	region = "europe-west1-b"
}

resource "google_compute_instance" "guacserver$4" {
  name         = "guacserver$4"
  machine_type = "n1-standard-1"
  zone         = "europe-west1-b"
  disk 
  {
    image = "debian-cloud/debian-8"
  }
  network_interface 
  {
    network = "default"
    access_config 
    {
      // Ephemeral IP
    }
  }
  metadata 
  {
    foo = "bar"
    created-by = "remsgroup"
    reserved-useless = "$3"
  }
EOF

cat << EOF >> guacserver/lab_gen.tf
  metadata_startup_script = "sudo wget --user ftpuser --password ftpuser ftp://$ftpserver/installguac && sudo bash installguac && echo root:root | sudo chpasswd"
EOF

cat << EOF >> guacserver/lab_gen.tf
  service_account 
  {
    scopes = ["userinfo-email", "compute-ro", "storage-ro"]
  }
}
EOF

echo "creation du reseau"
cd netinit
xterm -e "terraform apply" &
sleep 0.2
cd ..
wait

for i in `seq 1 $1`
do
	echo "creation du lab pour eleve$i"
	cd eleve$i
	xterm -e "terraform apply" &
	sleep 0.2
	cd ..
done

echo "creation de l'instance guacamole"
cd guacserver
xterm -e "terraform apply" &
sleep 0.2
cd ..

echo "creation des instances---->wait"
wait
echo "termine"

echo "creation regles firewall"
cd netinit/firewall
xterm -e "terraform apply" &
sleep 0.2
cd ..
cd ..
wait
echo "termine"

echo "script lancement destroy session"
#script de destruction des instances
xterm -e "bash classdestroy.bash $1" &
echo "termine"




