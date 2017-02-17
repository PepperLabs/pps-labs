sudo su -

apt-get update || echo "apt-get update" >> /install_log

mkdir -p /root && cd /root

##librairie necessaires
apt-get --yes --force-yes install automake autoconf libtool libcairo2-dev libpng-dev libossp-uuid-dev \
libfreerdp-dev libpango1.0-dev libssh2-1-dev libtelnet-dev libvncserver-dev \
libpulse-dev libssl-dev libvorbis-dev git || echo "apt-get install plein de trucs" >> /install_log


##cloner les sources via https
git clone https://github.com/glyptodon/guacamole-server || echo "git clone" >> /install_log

cd guacamole-server || echo "cd guac" >> /install_log

##generer le script configure et l\'92executer
autoreconf -fi || echo "autoreconf -fi" >> /install_log
./configure --with-init-dir=/etc/init.d|| echo "./configure" >> /install-log

##compilation des sources et installation
make || echo "make" >> /install-log
make install || echo "make install" >> /install-log
ldconfig || echo "ldconfig" >> /install-log ##??
/etc/init.d/guacd start || echo "guacd start" >> /install-log ## si pb tuer guacd\'85 \'e0 voir

##application java pour client utilisation de jetty8
apt-get --yes --force-yes install jetty8 || echo "install jetty8\n" >> /install-log

##modifier le fichier /etc/default/jetty8 en le refaisant
echo "NO_START=0" > /etc/default/jetty8
echo "VERBOSE=yes" >> /etc/default/jetty8
echo "JETTY_HOST={{{GUAC_IP}}}" >> /etc/default/jetty8
service jetty8 start || echo "jetty8 start \n" >> /install-log
##telechargement de l application

#http_proxy=http://proxy.efrei.fr:3128 # a decommenter et possitionner avant la ligne suivante si suivant
wget -O /usr/share/jetty8/webapps/guacamole.war \
http://downloads.sourceforge.net/project/guacamole/current/binary/guacamole-0.9.9.war?r=&ts=1421095336&use_mirror=optimate || echo "wget guac\n" >> /install-log

##creation fichier conf
mkdir /usr/share/jetty8/.guacamole || echo "mkdir .guac \n" >> /install-log
cd /usr/share/jetty8/.guacamole/ || echo "cd .guac \n" >> /install-log
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
{{{USER_MAPPING}}}
EOF

##deux fichier a modifier
echo "JETTY_PORT=80" >> /etc/default/jetty8

##remplacement de 8080 par 80 
sed -i 's/8080/80/' /etc/jetty8/jetty.xml || echo "sed 8080/80 \n" >> /install-log

##autoriser jetty8 a ecouter sur 80 en autorisant java

##recuperer le lien de java 
JAVA=$(which java)
##recuperer son lien absolu
JAVA=$(readlink -f $JAVA)
##autoriser les ports
setcap cap_net_bind_service=+ep $JAVA || echo "setcap java \n" >> /install-log
##lancer le service
sleep 2m && service jetty8 restart || echo "jetty8 restart \n" >> /install-log

##recuperation des fichiers et creation des liens symboliques necessaires
mkdir -p /usr/lib/x86_64-linux-gnu/freerdp/ || echo "mkdir -p freerdp \n" >> /install-log

lien1=$(find / -name guacdr-client.so | grep -v root)
lien2=$(find / -name guacsnd-client.so | grep -v root)

ln -s $lien1 /usr/lib/x86_64-linux-gnu/freerdp/guacdr-client.so || echo "ln -s cdr \n" >> /install-log
ln -s $lien2 /usr/lib/x86_64-linux-gnu/freerdp/guacsnd-client.so || echo "ln -s snd \n" >> /install-log



echo fini >> /fini.txt

