# ===============================
# SSH Tunnel Script
# 1) pem 경로를 본인 PC 경로로 수정하세요
# 2) 이 창은 닫지 마세요
# ===============================

# ★ 자신의 pem 파일 경로
$pem = "C:\Users\plastichero\Desktop\harudama\1589.pem"

ssh -N `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=3 `
  -i $pem `
  -L 3307:127.0.0.1:3306 `
  -L 6379:127.0.0.1:6379 `
  ubuntu@13.124.137.80
