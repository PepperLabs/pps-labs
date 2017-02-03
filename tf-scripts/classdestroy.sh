#!/bin/bash

if [ "$#" != 1 ] 
then
	echo "bad run"
	echo "usage: classdestroy.bash <students_number>"
	exit 0
fi

if [ "$1" == "-h" ]
then
	clear
	echo "classdestroy.bash - instances destruction - MANPAGE"
	echo "usage: classdestroy.bash <students_number>"
	

cat << EOF

#-------------INTRO----------------
this script is used with classinit.bash. Both are generated
in same [root] directory. Directory which contain eleveX childs.  
EOF
	exit 0
fi

#-------------------------
echo "destroy session"
echo "type y for destroy created instances & networks"
read y
if [ "$y" != "y" ]
then
	echo "do nothing"
	exit 1
fi

cd netinit/firewall
xterm -e "terraform destroy -force" &
sleep 0.2
cd ..
cd ..
wait

for i in `seq 1 $1`
do
	cd eleve$i
	xterm -e "terraform destroy -force" &
	sleep 0.2
	cd ..
done

cd guacserver
xterm -e "terraform destroy -force" &
sleep 0.2
cd ..

echo "destruction des instances---->wait"
wait
echo "termine"

cd netinit
xterm -e "terraform destroy -force" &
sleep 0.2
cd ..

echo "destruction des reseaux---->wait"
wait
echo "termine"
exit 0

