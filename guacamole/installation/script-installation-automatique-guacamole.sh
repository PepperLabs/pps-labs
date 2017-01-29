#!/bin/bash
sudo su
echo "debut"
apt-get update
##librairie necessaires
apt-get --yes --force-yes install automake autoconf libtool libcairo2-dev libpng12-dev libossp-uuid-dev libfreerdp-dev libpango1.0-dev libssh2-1-dev libtelnet-dev libvncserver-dev libpulse-dev libssl-dev libvorbis-dev git

##cloner les sources via https
git clone https://github.com/glyptodon/guacamole-server
apt-get --yes --force-yes install automake autoconf libtool libcairo2-dev libpng12-dev libossp-uuid-dev libfreer
cd guacamole-server
##generer le script configure et l\'92executer
autoreconf -fi
./configure --with-init-dir=/etc/init.d
##compilation des sources et installation
make
make install
ldconfig ##??
/etc/init.d/guacd start ## si pb tuer guacd\'85 \'e0 voir

##application java pour client utilisation de jetty8
apt-get --yes --force-yes install jetty8

##modifier le fichier /etc/default/jetty8 en le refaisant
echo "NO_START=0" > /etc/default/jetty8
echo "VERBOSE=yes" >> /etc/default/jetty8
echo "JETTY_HOST=10.142.0.6" >> /etc/default/jetty8

##lancer le service
service jetty8 start

##telechargement de l application

#http_proxy=http://proxy.efrei.fr:3128 # a decommenter et possitionner avant la ligne suivante si suivant
wget -O /usr/share/jetty8/webapps/guacamole.war http://downloads.sourceforge.net/project/guacamole/current/binar
y/guacamole-0.9.9.war?r=&ts=1421095336&use_mirror=optimate
service jetty8 restart

##creation fichier conf
mkdir /usr/share/jetty8/.guacamole
cd /usr/share/jetty8/.guacamole/
echo -e "# Hostname and port of guacamole proxy\n\
guacd-hostname: localhost\n\
guacd-port:     4822\n\

# Location to read extra .jar's from\n\
lib-directory:  /usr/share/jetty8/.guacamole\n\

# Authentication provider class\n\
auth-provider: net.sourceforge.guacamole.net.basic.BasicFileAuthenticationProvider\n\

# Properties used by BasicFileAuthenticationProvider\n\
basic-user-mapping: /usr/share/jetty8/.guacamole/user-mapping.xml\n" > guacamole.properties

cat << EOF > /usr/share/jetty8/.guacamole/user-mapping.xml
<user-mapping>
  <authorize username="guacuser" password="passwd">
   <connection name="ssh_guacamole">
      <protocol>ssh</protocol>
      <param name="hostname">127.0.0.1r</param>
      <param name="port">22</param>
      <param name="server-layout">fr-fr-azerty</param>
      <param name="color-depth">16</param>
    </connection>
  </authorize>
</user-mapping>
EOF

echo fini >> /fini.txt