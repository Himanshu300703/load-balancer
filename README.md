# Load-Balancer   
Classic TCP LB implementation in Node.js   
   
Getting Started   
===============   
Step 1: Introduce the target servers in [conf][1]   
Step 2: Toggle the stickySession in [conf][1] if required   
Step 3: Start clustered LB using `node lb.js`   
Step 4: Start stand-alone LB using `node lib/main.js`   
   
[1]:    ./conf/lb.json
