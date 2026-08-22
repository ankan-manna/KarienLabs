# MedCommerce EC2 Stop / Start Guide

## Purpose

This project is only needed for college final exams and placement
interviews.

Because the EC2 instance uses a normal public IPv4 address, **stopping
and starting the instance can assign a new public IP**. This guide
explains how to stop it safely and how to bring it back online later
without using an Elastic IP.

------------------------------------------------------------------------

## 1. Current Architecture

``` text
Frontend
  ↓
Vercel
  ↓
api.clientlivedemo.shop
  ↓
BigRock DNS
  ↓
AWS EC2
  ↓
Docker NGINX / HTTPS
  ↓
Docker API / Worker / Redis
```

Important API DNS record:

``` text
api.clientlivedemo.shop → CURRENT EC2 PUBLIC IPv4
```

Your frontend is on Vercel. Your API is running on the EC2 instance.

------------------------------------------------------------------------

# PART A --- STOPPING THE EC2

## 2. Before Stopping the EC2

SSH into the EC2 and run:

``` bash
cd /opt/medcommerce
```

Check the current public IP:

``` bash
curl -4 ifconfig.me
```

Save this IP somewhere if useful for reference.

Check Docker:

``` bash
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env.production ps
```

You do **not** need to rebuild the Docker images just because you are
stopping the EC2.

Your project files, Docker images, and containers are stored on the
EC2's attached storage.

------------------------------------------------------------------------

## 3. Stop the EC2

Go to:

**AWS Console → EC2 → Instances → select your MedCommerce instance →
Instance state → Stop instance**

### IMPORTANT

Use:

**STOP**

Do **not** use:

**TERMINATE**

Stopping keeps the EC2 instance and its attached storage.

After stopping the EC2, the website/API being unavailable is expected.

------------------------------------------------------------------------

# PART B --- STARTING THE EC2 LATER

## 4. Start the EC2

When you need the project again:

**AWS Console → EC2 → Instances → select the same instance → Instance
state → Start instance**

Wait until the instance is running.

Then SSH into it.

------------------------------------------------------------------------

## 5. Get the NEW Public IP

This is the most important step.

Run:

``` bash
curl -4 ifconfig.me
```

Example:

``` text
NEW EC2 IP:
3.110.219.198
```

Do not assume the old IP is still valid.

### Rule to remember

``` text
EC2 STOP → START
        ↓
Public IP may change
        ↓
Update DNS
```

------------------------------------------------------------------------

# PART C --- UPDATE BIGROCK

## 6. Update the BigRock API A Record

Go to:

**BigRock → Manage DNS Records → A Records**

Find:

``` text
api.clientlivedemo.shop
```

Set it to:

``` text
Type: A
Host/Name: api
Value: <NEW_EC2_PUBLIC_IP>
```

For example:

``` text
api.clientlivedemo.shop → 3.110.219.198
```

### Do NOT change these unnecessarily

Your frontend is on Vercel, so do not modify:

``` text
clientlivedemo.shop
www.clientlivedemo.shop
```

unless you specifically know their Vercel configuration needs changing.

Your main EC2-related record is:

``` text
api.clientlivedemo.shop
```

------------------------------------------------------------------------

# PART D --- CHECK VERCEL

## 7. Check the Vercel DNS Configuration

In your current setup, the Vercel Domains page also shows an `api` A
record.

So after every EC2 restart:

**Vercel → Domains → clientlivedemo.shop → DNS Records**

Check whether you have:

``` text
api    A    <OLD_IP>
```

If an `api` A record exists there and it is intended to manage the API
DNS, update it to:

``` text
api    A    <NEW_EC2_PUBLIC_IP>
```

### IMPORTANT

Do not create duplicate `api` A records in both places.

Your screenshots show that BigRock is the domain registrar and Vercel is
using Vercel nameservers for the domain setup, while BigRock also has
DNS records. If you see conflicting DNS management, always check which
nameservers are authoritative before changing records.

The goal is simple:

``` text
api.clientlivedemo.shop
        ↓
NEW EC2 PUBLIC IP
```

------------------------------------------------------------------------

# PART E --- START DOCKER

## 8. Start the Docker Services

SSH into EC2:

``` bash
cd /opt/medcommerce
```

Then run:

``` bash
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env.production \
  up -d
```

Check:

``` bash
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env.production \
  ps
```

You should see the services running.

Typical services:

``` text
api-1
api-2
worker
redis
nginx
certbot
```

------------------------------------------------------------------------

# PART F --- VERIFY DNS

## 9. Check Public DNS

From your Mac:

``` bash
nslookup api.clientlivedemo.shop
```

The result should eventually be:

``` text
3.110.219.198
```

You can also check Cloudflare's public DNS:

``` bash
dig @1.1.1.1 api.clientlivedemo.shop +short
```

Expected:

``` text
3.110.219.198
```

If the old IP appears temporarily, wait for DNS cache/propagation.

------------------------------------------------------------------------

# PART G --- TEST THE API

## 10. Test HTTPS

From your Mac:

``` bash
curl -vk https://api.clientlivedemo.shop/
```

A response such as:

``` text
HTTP/2 404
```

with:

``` json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Cannot GET /"
  }
}
```

is acceptable.

It means:

``` text
Mac
 ↓
DNS
 ↓
EC2
 ↓
NGINX
 ↓
HTTPS
 ↓
API
```

is working.

The `/` route simply does not exist in the API.

------------------------------------------------------------------------

# PART H --- IF DNS IS STILL OLD

## 11. Force-Test the New IP

If your normal DNS still resolves to the old IP, test the new EC2 IP
directly:

``` bash
curl -vk \
  --resolve api.clientlivedemo.shop:443:<NEW_EC2_IP> \
  https://api.clientlivedemo.shop/
```

Example:

``` bash
curl -vk \
  --resolve api.clientlivedemo.shop:443:3.110.219.198 \
  https://api.clientlivedemo.shop/
```

If this returns an HTTP response from NGINX/API, your EC2 and Docker
setup are working.

The remaining issue is DNS propagation/cache.

------------------------------------------------------------------------

# PART I --- DO NOT REBUILD UNNECESSARILY

## 12. Normal EC2 Restart Does NOT Require a Build

If you only:

``` text
EC2 Stop
   ↓
EC2 Start
```

do **not** automatically run:

``` bash
docker compose build
```

You only need:

``` bash
docker compose ... up -d
```

The Docker images and project files remain on the EC2 storage.

### Build only when needed

Run a build if you actually changed application code/Docker
configuration and need a new image:

``` bash
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env.production \
  build
```

------------------------------------------------------------------------

# PART J --- COMPLETE RESTART CHECKLIST

Use this every time you need the project.

``` text
☐ 1. Start EC2 in AWS

☐ 2. SSH into EC2

☐ 3. Run:
     curl -4 ifconfig.me

☐ 4. Copy the NEW public IP

☐ 5. BigRock:
     api.clientlivedemo.shop
     → A
     → NEW EC2 IP

☐ 6. Check Vercel DNS:
     api → NEW EC2 IP
     only if Vercel has an API A record that is part of your active DNS setup

☐ 7. Wait for DNS propagation

☐ 8. Start Docker:
     cd /opt/medcommerce

     docker compose \
       -f infra/docker/docker-compose.yml \
       -f infra/docker/docker-compose.prod.yml \
       --env-file .env.production \
       up -d

☐ 9. Check containers:
     docker compose \
       -f infra/docker/docker-compose.yml \
       -f infra/docker/docker-compose.prod.yml \
       --env-file .env.production \
       ps

☐ 10. Check DNS:
      dig @1.1.1.1 api.clientlivedemo.shop +short

☐ 11. Test API:
      curl -vk https://api.clientlivedemo.shop/

☐ 12. Open the Vercel frontend

☐ 13. Test login/API/application functionality
```

------------------------------------------------------------------------

# PART K --- CURRENT EXAMPLE

During the last restart:

``` text
OLD EC2 IP
13.233.117.241
```

changed to:

``` text
NEW EC2 IP
3.110.219.198
```

The BigRock API record was changed from:

``` text
api.clientlivedemo.shop
        ↓
13.233.117.241
```

to:

``` text
api.clientlivedemo.shop
        ↓
3.110.219.198
```

After DNS propagation, the Mac resolved:

``` text
api.clientlivedemo.shop
        ↓
3.110.219.198
```

and HTTPS successfully reached NGINX/API.

------------------------------------------------------------------------

# PART L --- IF THE SITE IS STILL PENDING

If the Vercel frontend shows API requests as `Pending` after the above
steps:

### 1. Check DNS from your Mac

``` bash
nslookup api.clientlivedemo.shop
```

It should show the new EC2 IP.

### 2. Test the API directly

``` bash
curl -vk https://api.clientlivedemo.shop/
```

### 3. Check Docker

``` bash
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env.production \
  ps
```

### 4. Check NGINX logs

``` bash
docker logs --tail=200 medcommerce-prod-nginx-1
```

### 5. Check API logs

``` bash
docker logs --tail=200 medcommerce-prod-api-1
```

Only start changing NGINX/application configuration if these checks show
an actual application/server problem.

------------------------------------------------------------------------

# PART M --- IMPORTANT DNS WARNING

Because you are intentionally avoiding an Elastic IP to save cost:

**Assume the EC2 public IP changes every time you Stop → Start.**

You do not need to remember the old IP.

Always do:

``` bash
curl -4 ifconfig.me
```

then update the API DNS record to that IP.

Your recurring process is:

``` text
START EC2
   ↓
GET NEW IP
   ↓
UPDATE api DNS
   ↓
START DOCKER
   ↓
WAIT FOR DNS
   ↓
TEST API
   ↓
TEST VERCEL FRONTEND
```

------------------------------------------------------------------------

# PART N --- COST-SAVING NOTE

Stopping the EC2 when you do not need the college project is reasonable.

However, stopping EC2 does not necessarily make every AWS cost zero. You
can still have charges for things such as:

-   EBS storage
-   Snapshots
-   Other AWS resources
-   Data transfer
-   Domains or third-party services

Check AWS Billing/Cost Management periodically.

------------------------------------------------------------------------

# FINAL RULE

> **Every time you Stop → Start this EC2, assume the public IP has
> changed.**

Get the new IP first:

``` bash
curl -4 ifconfig.me
```

Then update:

``` text
api.clientlivedemo.shop
```

to the new IP in the active DNS configuration, start Docker, verify DNS,
and test the API.

**Do not terminate the EC2. Stop it.**
