#!/bin/bash
###variables a modifier
servPlat={{{PPS_IP}}}
cheminLocalGuac={{{GUAC_PATH}}}
cheminServPlat={{{PPS_PATH}}}

n=0
j=0

for i in "$@"
do
case $i in 
	-ip=*)
	IP[n]="${i#*=}"
	n=$n+1
	shift
	;;
	-f=*)
	FILES[j]="${i#*=}"
	j=$j+1
	shift
	;;
	--default)
	DEFAULT=YES
	shift
	;;
	*)
	
	;;
esac
done

for ip in ${IP[*]};
do
	for file in ${FILES[*]};
	do
		ssh root@$servPlat mkdir -p $cheminServPlat/correction/ && echo "creation dossier OK" 
		mkdir -p $cheminLocalGuac/correction/$ip$(echo $file | sed -e 's/\([a-zA-Z0-9._]*$\)//') && echo "creation dossier local OK"
		scp root@$ip:$file $cheminLocalGuac/correction/$ip/$file && echo "fichier copie locale OK"
	done
done

scp -r $cheminLocalGuac/correction/ root@$servPlat:$cheminServPlat/ && echo "fichier copie locale OK"
