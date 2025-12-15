# Instagram VPS Backend Setup Guide

## Overview
This Python backend handles Instagram API operations with proxy support to prevent IP bans.

## Requirements
- Ubuntu 22.04 VPS (same as Telegram VPS)
- Docker & Docker Compose
- Residential Proxy subscription (Bright Data, Smartproxy, or Oxylabs)

## Step 1: Create Directory Structure

```bash
ssh root@YOUR_VPS_IP
cd /root
mkdir -p instagram-api
cd instagram-api
```

## Step 2: Create Python Backend Files

### main.py
```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import json
import logging
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Instagram VPS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SessionRequest(BaseModel):
    cookies: str
    proxy_host: Optional[str] = None
    proxy_port: Optional[int] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None

class PostPhotoRequest(BaseModel):
    cookies: str
    image_url: Optional[str] = None
    image_data: Optional[str] = None  # base64
    caption: Optional[str] = ""
    proxy_host: Optional[str] = None
    proxy_port: Optional[int] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None

class UpdateBioRequest(BaseModel):
    cookies: str
    bio: str
    proxy_host: Optional[str] = None
    proxy_port: Optional[int] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None

def get_proxy_url(host: str, port: int, username: str = None, password: str = None) -> str:
    """Build proxy URL for httpx"""
    if username and password:
        return f"http://{username}:{password}@{host}:{port}"
    return f"http://{host}:{port}"

def parse_cookies(cookies_str: str) -> dict:
    """Parse cookies from various formats"""
    cookies = {}
    
    try:
        # Try JSON array format
        data = json.loads(cookies_str)
        if isinstance(data, list):
            for item in data:
                if 'name' in item and 'value' in item:
                    cookies[item['name']] = item['value']
            return cookies
        elif isinstance(data, dict):
            return data
    except:
        pass
    
    # Try string format: "key=value; key2=value2"
    for part in cookies_str.split(';'):
        part = part.strip()
        if '=' in part:
            key, value = part.split('=', 1)
            cookies[key.strip()] = value.strip()
    
    return cookies

INSTAGRAM_HEADERS = {
    'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'X-IG-App-ID': '936619743392459',
    'X-IG-Device-ID': 'android-1234567890abcdef',
    'X-IG-Android-ID': 'android-1234567890abcdef',
    'X-FB-HTTP-Engine': 'Liger',
}

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "instagram-vps"}

@app.post("/validate-session")
async def validate_session(request: SessionRequest):
    """Validate Instagram session cookies"""
    try:
        cookies = parse_cookies(request.cookies)
        
        if 'sessionid' not in cookies:
            return {"valid": False, "error": "No sessionid in cookies"}
        
        ds_user_id = cookies.get('ds_user_id', '')
        
        # Build proxy config
        proxy = None
        if request.proxy_host and request.proxy_port:
            proxy = get_proxy_url(
                request.proxy_host, 
                request.proxy_port,
                request.proxy_username,
                request.proxy_password
            )
        
        async with httpx.AsyncClient(proxy=proxy, timeout=30.0) as client:
            response = await client.get(
                f"https://i.instagram.com/api/v1/users/{ds_user_id}/info/",
                headers={**INSTAGRAM_HEADERS, 'Cookie': '; '.join(f'{k}={v}' for k, v in cookies.items())}
            )
            
            data = response.json()
            logger.info(f"Validate session response: {response.status_code}")
            
            # Check for suspension
            if 'message' in data and data.get('message') == 'challenge_required':
                return {"valid": False, "status": "suspended", "error": "Account suspended"}
            
            if 'user' in data:
                user = data['user']
                return {
                    "valid": True,
                    "status": "active",
                    "username": user.get('username'),
                    "full_name": user.get('full_name'),
                    "profile_pic_url": user.get('profile_pic_url'),
                    "follower_count": user.get('follower_count', 0),
                    "following_count": user.get('following_count', 0),
                    "media_count": user.get('media_count', 0),
                    "biography": user.get('biography', '')
                }
            
            return {"valid": False, "status": "expired", "error": "Session expired"}
            
    except Exception as e:
        logger.error(f"Validate session error: {str(e)}")
        return {"valid": False, "error": str(e)}

@app.post("/post-photo")
async def post_photo(request: PostPhotoRequest):
    """Post photo to Instagram"""
    try:
        cookies = parse_cookies(request.cookies)
        
        if 'sessionid' not in cookies:
            return {"success": False, "error": "No sessionid in cookies"}
        
        csrftoken = cookies.get('csrftoken', '')
        
        # Build proxy config
        proxy = None
        if request.proxy_host and request.proxy_port:
            proxy = get_proxy_url(
                request.proxy_host, 
                request.proxy_port,
                request.proxy_username,
                request.proxy_password
            )
        
        async with httpx.AsyncClient(proxy=proxy, timeout=60.0) as client:
            # Step 1: Download image if URL provided
            if request.image_url:
                img_response = await client.get(request.image_url)
                image_data = img_response.content
            elif request.image_data:
                import base64
                image_data = base64.b64decode(request.image_data)
            else:
                return {"success": False, "error": "No image provided"}
            
            # Step 2: Upload to Instagram
            upload_id = str(int(asyncio.get_event_loop().time() * 1000))
            
            upload_headers = {
                **INSTAGRAM_HEADERS,
                'Cookie': '; '.join(f'{k}={v}' for k, v in cookies.items()),
                'X-CSRFToken': csrftoken,
                'X-Instagram-Rupload-Params': json.dumps({
                    "media_type": 1,
                    "upload_id": upload_id,
                    "upload_media_height": 1080,
                    "upload_media_width": 1080
                }),
                'X-Entity-Type': 'image/jpeg',
                'X-Entity-Name': f'{upload_id}_0_{len(image_data)}',
                'X-Entity-Length': str(len(image_data)),
                'Content-Type': 'application/octet-stream',
                'Offset': '0',
            }
            
            upload_response = await client.post(
                f"https://i.instagram.com/rupload_igphoto/{upload_id}_0_{len(image_data)}",
                headers=upload_headers,
                content=image_data
            )
            
            upload_result = upload_response.json()
            logger.info(f"Upload response: {upload_result}")
            
            if 'upload_id' not in upload_result:
                return {"success": False, "error": "Upload failed", "details": upload_result}
            
            # Step 3: Configure media
            await asyncio.sleep(2)  # Wait for processing
            
            configure_data = {
                'upload_id': upload_id,
                'caption': request.caption or '',
                'source_type': '4',
                'disable_comments': '0',
            }
            
            configure_headers = {
                **INSTAGRAM_HEADERS,
                'Cookie': '; '.join(f'{k}={v}' for k, v in cookies.items()),
                'X-CSRFToken': csrftoken,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
            
            configure_response = await client.post(
                "https://i.instagram.com/api/v1/media/configure/",
                headers=configure_headers,
                data=configure_data
            )
            
            result = configure_response.json()
            logger.info(f"Configure response: {result}")
            
            if result.get('status') == 'ok':
                return {
                    "success": True,
                    "media_id": result.get('media', {}).get('id'),
                    "code": result.get('media', {}).get('code')
                }
            
            # Check for suspension/challenge
            if result.get('message') == 'challenge_required':
                return {"success": False, "status": "suspended", "error": "Account suspended"}
            
            return {"success": False, "error": result.get('message', 'Unknown error')}
            
    except Exception as e:
        logger.error(f"Post photo error: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/update-bio")
async def update_bio(request: UpdateBioRequest):
    """Update Instagram bio"""
    try:
        cookies = parse_cookies(request.cookies)
        
        if 'sessionid' not in cookies:
            return {"success": False, "error": "No sessionid in cookies"}
        
        csrftoken = cookies.get('csrftoken', '')
        ds_user_id = cookies.get('ds_user_id', '')
        
        # Build proxy config
        proxy = None
        if request.proxy_host and request.proxy_port:
            proxy = get_proxy_url(
                request.proxy_host, 
                request.proxy_port,
                request.proxy_username,
                request.proxy_password
            )
        
        async with httpx.AsyncClient(proxy=proxy, timeout=30.0) as client:
            response = await client.post(
                "https://i.instagram.com/api/v1/accounts/set_biography/",
                headers={
                    **INSTAGRAM_HEADERS,
                    'Cookie': '; '.join(f'{k}={v}' for k, v in cookies.items()),
                    'X-CSRFToken': csrftoken,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data={'biography': request.bio}
            )
            
            result = response.json()
            logger.info(f"Update bio response: {result}")
            
            if result.get('status') == 'ok':
                return {"success": True, "bio": request.bio}
            
            if result.get('message') == 'challenge_required':
                return {"success": False, "status": "suspended", "error": "Account suspended"}
            
            return {"success": False, "error": result.get('message', 'Unknown error')}
            
    except Exception as e:
        logger.error(f"Update bio error: {str(e)}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### requirements.txt
```
fastapi==0.104.1
uvicorn==0.24.0
httpx==0.25.2
pydantic==2.5.2
```

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  instagram-api:
    build: .
    ports:
      - "8001:8001"
    restart: always
    environment:
      - PYTHONUNBUFFERED=1
```

## Step 3: Deploy

```bash
cd /root/instagram-api

# Create the files above, then:
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

## Step 4: Test

```bash
curl http://YOUR_VPS_IP:8001/health
# Should return: {"status": "ok", "service": "instagram-vps"}
```

## Step 5: Configure Admin Panel

In your Lovable app admin panel:
- The VPS IP is shared with Telegram (same config)
- Instagram uses port 8001, Telegram uses port 8000

## Proxy Integration

Each Instagram account should have assigned proxy:
- `proxy_host`: e.g., "geo.iproyal.com"
- `proxy_port`: e.g., 12321
- `proxy_username`: your proxy username
- `proxy_password`: your proxy password

Residential proxy providers:
- **Bright Data**: ~$15/GB
- **Smartproxy**: ~$12/GB  
- **IPRoyal**: ~$7/GB (budget option)
- **Oxylabs**: ~$15/GB

## Firewall

```bash
# Allow Instagram API port
ufw allow 8001/tcp
```

## Running Both Telegram & Instagram

If running both on same VPS:
- Telegram: port 8000
- Instagram: port 8001

Both can run simultaneously using Docker.
