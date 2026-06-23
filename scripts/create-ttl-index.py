#!/usr/bin/env python3.11
"""
创建 deduction_locks TTL 索引

微信云开发控制台 UI 不支持创建 TTL 索引，
需要通过 HTTP API 创建。
"""

import json
import ssl
import urllib.request

APPID = "wx73b9c9702f51e839"
APPSECRET = "b4165d1d0d4b6a1d27bcf4bd1219a2dc"
ENV_ID = "cloud1-d7gjypgxued9a2b27"

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE


def get_access_token():
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={APPSECRET}"
    with urllib.request.urlopen(url, timeout=30, context=ssl_context) as resp:
        data = json.loads(resp.read().decode())
        return data["access_token"]


def create_ttl_index(token):
    url = f"https://api.weixin.qq.com/tcb/createindex?access_token={token}"
    payload = {
        "env": ENV_ID,
        "collection_name": "deduction_locks",
        "create_indexes": [
            {
                "Name": "expireAt_ttl",
                "Key": {"expireAt": 1},
                "Background": True,
                "ExpireAfterSeconds": 604800,
            }
        ],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_context) as resp:
        result = json.loads(resp.read().decode())
        return result


def main():
    print("[1/2] 获取 access_token...")
    token = get_access_token()
    print("  ✓ token 获取成功")

    print("[2/2] 创建 TTL 索引 (expireAt_ttl, 604800s)...")
    result = create_ttl_index(token)
    print(f"  结果: {json.dumps(result, indent=2, ensure_ascii=False)}")

    if result.get("errcode", 0) == 0:
        print("\n✅ TTL 索引创建成功！")
    else:
        print(f"\n❌ 创建失败: {result.get('errmsg', 'unknown error')}")


if __name__ == "__main__":
    main()
