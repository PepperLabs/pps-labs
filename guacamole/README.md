# Guagamole
## Installation de guacamole
Lancer le script script-installation-automatique-guacamole.sh.

Le site est alors disponible à "IPmachine:8080/guacamole", pour le faire passer sur le port 80, lancer le script jetty8_port80.sh

## Gérer les utilisateurs et machines
Gestions des utilisateurs et machines dans le fichier  /usr/share/jetty8/.guacamole/user-mapping.xml.

Dans le dossier utilisateurs, le fichier user-mapping.xml en est un exemple.   
Les fichiers :
 * user-mapping-SSH.xml
 * user-mapping-VNC.xml
 * user-mapping-RDP.xml
    
explicitent la construction pour ces différents protocoles.
