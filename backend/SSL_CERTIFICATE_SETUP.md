# SSL/TLS Certificate Setup Guide

MaxLab 플랫폼의 HTTPS 설정을 위한 가이드입니다.

## 도메인 정보

- Production: `maxlab.chem.co.kr`
- Development: `devmaxlab.chem.co.kr`

## Let's Encrypt를 사용한 무료 SSL 인증서 발급

### 1. Certbot 설치

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install epel-release
sudo yum install certbot python3-certbot-nginx
```

### 2. 인증서 발급

#### Production 도메인

```bash
# Nginx가 실행 중이어야 합니다
sudo certbot certonly --nginx \
  -d maxlab.chem.co.kr \
  -d www.maxlab.chem.co.kr \
  --non-interactive \
  --agree-tos \
  --email admin@chem.co.kr \
  --redirect
```

#### Development 도메인

```bash
sudo certbot certonly --nginx \
  -d devmaxlab.chem.co.kr \
  --non-interactive \
  --agree-tos \
  --email admin@chem.co.kr \
  --redirect
```

### 3. 인증서 자동 갱신 설정

```bash
# Cron job 추가
sudo crontab -e

# 매일 오전 3시에 인증서 갱신 시도
0 3 * * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
```

## 상용 SSL 인증서 사용 (선택사항)

### 1. CSR 생성

```bash
# Production
openssl req -new -newkey rsa:2048 -nodes \
  -keyout /etc/ssl/private/maxlab.chem.co.kr.key \
  -out /etc/ssl/certs/maxlab.chem.co.kr.csr \
  -subj "/C=KR/ST=Seoul/L=Seoul/O=Chem Co Ltd/CN=maxlab.chem.co.kr"

# Development
openssl req -new -newkey rsa:2048 -nodes \
  -keyout /etc/ssl/private/devmaxlab.chem.co.kr.key \
  -out /etc/ssl/certs/devmaxlab.chem.co.kr.csr \
  -subj "/C=KR/ST=Seoul/L=Seoul/O=Chem Co Ltd/CN=devmaxlab.chem.co.kr"
```

### 2. 인증서 설치

인증서 발급 후:

```bash
# Production
sudo cp your-certificate.crt /etc/ssl/certs/maxlab.chem.co.kr.crt
sudo cp your-ca-bundle.crt /etc/ssl/certs/maxlab.chem.co.kr.ca-bundle.crt
sudo cat /etc/ssl/certs/maxlab.chem.co.kr.crt \
         /etc/ssl/certs/maxlab.chem.co.kr.ca-bundle.crt \
         > /etc/ssl/certs/maxlab.chem.co.kr.fullchain.pem

# Development
sudo cp your-certificate.crt /etc/ssl/certs/devmaxlab.chem.co.kr.crt
sudo cp your-ca-bundle.crt /etc/ssl/certs/devmaxlab.chem.co.kr.ca-bundle.crt
sudo cat /etc/ssl/certs/devmaxlab.chem.co.kr.crt \
         /etc/ssl/certs/devmaxlab.chem.co.kr.ca-bundle.crt \
         > /etc/ssl/certs/devmaxlab.chem.co.kr.fullchain.pem
```

### 3. Nginx 설정 업데이트

상용 인증서를 사용하는 경우 Nginx 설정 파일의 SSL 경로를 업데이트:

```nginx
# Production
ssl_certificate /etc/ssl/certs/maxlab.chem.co.kr.fullchain.pem;
ssl_certificate_key /etc/ssl/private/maxlab.chem.co.kr.key;

# Development
ssl_certificate /etc/ssl/certs/devmaxlab.chem.co.kr.fullchain.pem;
ssl_certificate_key /etc/ssl/private/devmaxlab.chem.co.kr.key;
```

## 인증서 확인

### 1. 인증서 정보 확인

```bash
# Let's Encrypt 인증서
sudo certbot certificates

# 인증서 상세 정보
openssl x509 -in /etc/letsencrypt/live/maxlab.chem.co.kr/cert.pem -text -noout
```

### 2. HTTPS 연결 테스트

```bash
# SSL 연결 테스트
openssl s_client -connect maxlab.chem.co.kr:443 -servername maxlab.chem.co.kr

# curl 테스트
curl -I https://maxlab.chem.co.kr
curl -I https://devmaxlab.chem.co.kr
```

### 3. SSL Labs 테스트

웹 브라우저에서 확인:
- https://www.ssllabs.com/ssltest/analyze.html?d=maxlab.chem.co.kr
- https://www.ssllabs.com/ssltest/analyze.html?d=devmaxlab.chem.co.kr

## 보안 권장사항

### 1. 파일 권한 설정

```bash
# 키 파일 권한
sudo chmod 600 /etc/letsencrypt/live/*/privkey.pem
sudo chown root:root /etc/letsencrypt/live/*/privkey.pem

# 인증서 디렉토리 권한
sudo chmod 755 /etc/letsencrypt/live/
sudo chmod 755 /etc/letsencrypt/archive/
```

### 2. DH Parameters 생성

```bash
# 2048-bit DH parameters (빠른 생성)
sudo openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048

# 4096-bit DH parameters (더 안전하지만 시간이 오래 걸림)
# sudo openssl dhparam -out /etc/ssl/certs/dhparam.pem 4096
```

Nginx 설정에 추가:
```nginx
ssl_dhparam /etc/ssl/certs/dhparam.pem;
```

### 3. OCSP Stapling 확인

```bash
# OCSP stapling 테스트
openssl s_client -connect maxlab.chem.co.kr:443 \
  -servername maxlab.chem.co.kr -status -tlsextdebug
```

## 문제 해결

### Let's Encrypt 인증서 발급 실패

1. DNS 레코드 확인:
```bash
nslookup maxlab.chem.co.kr
nslookup devmaxlab.chem.co.kr
```

2. 방화벽 설정 확인 (포트 80, 443 열려있어야 함):
```bash
sudo ufw status
sudo iptables -L
```

3. Nginx 설정 확인:
```bash
sudo nginx -t
sudo systemctl status nginx
```

### 인증서 갱신 실패

1. 수동 갱신 테스트:
```bash
sudo certbot renew --dry-run
```

2. 로그 확인:
```bash
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

3. 강제 갱신:
```bash
sudo certbot renew --force-renewal
```

## 모니터링

### 인증서 만료일 확인 스크립트

```bash
#!/bin/bash
# /usr/local/bin/check-ssl-expiry.sh

DOMAINS="maxlab.chem.co.kr devmaxlab.chem.co.kr"
ALERT_DAYS=30

for domain in $DOMAINS; do
    expiry_date=$(echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | \
                  openssl x509 -noout -enddate | cut -d= -f2)
    expiry_epoch=$(date -d "$expiry_date" +%s)
    current_epoch=$(date +%s)
    days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))
    
    echo "$domain: $days_left days left (expires: $expiry_date)"
    
    if [ $days_left -lt $ALERT_DAYS ]; then
        echo "WARNING: $domain certificate expires in $days_left days!" | \
        mail -s "SSL Certificate Expiry Warning" admin@chem.co.kr
    fi
done
```

Cron job 추가:
```bash
# 매주 월요일 오전 9시에 확인
0 9 * * 1 /usr/local/bin/check-ssl-expiry.sh
```