#!/bin/bash
sudo su

##deux fichier a modifier
echo "JETTY_PORT=80" >> /etc/default/jetty8

##remplacement de 8080 par 80 
sed -i 's/8080/80/' /etc/jetty8/jetty.xml

##autoriser jetty8 a ecouter sur 80 en autorisant java

##recuperer le lien de java 
JAVA=$(which java)
##recuperer son lien absolu
JAVA=$(readlink -f $JAVA)
##autoriser les ports
setcap cap_net_bind_service=+ep $JAVA

##relancer jetty8
service jetty8 restart