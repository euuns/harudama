ssh -N `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=3 `
  -i "C:\Users\plastichero\Desktop\harudama\1589.pem"
  -L 3307:127.0.0.1:3306 `
  -L 6379:127.0.0.1:6379 `
  ubuntu@13.124.137.80
