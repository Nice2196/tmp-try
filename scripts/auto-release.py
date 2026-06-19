#!/usr/bin/env python3.11
"""
小程序自动发布脚本
功能：上传代码 → 设置体验版 → 获取预览码 → 获取体验码
用法：python3.11 scripts/auto-release.py [版本描述]
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime

# ============================================================
# 配置
# ============================================================
APPID = "wx73b9c9702f51e839"
APPSECRET = "b4165d1d0d4b6a1d27bcf4bd1219a2dc"
PROJECT_DIR = "/Volumes/macSdcard/AICoding/smart-hours"
DEVTOOLS_PORT = 60578
OUTPUT_DIR = os.path.join(PROJECT_DIR, "release")

# 版本号文件
VERSION_FILE = os.path.join(PROJECT_DIR, ".version")

# ============================================================
# 工具函数
# ============================================================


def log(msg, level="INFO"):
    """打印日志"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def http_get(url, timeout=60):
    """发送 GET 请求"""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read(), response.status
    except urllib.error.HTTPError as e:
        return e.read(), e.code
    except Exception as e:
        return str(e), 0


def http_post(url, data=None, timeout=60):
    """发送 POST 请求"""
    try:
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read(), response.status
    except urllib.error.HTTPError as e:
        return e.read(), e.code
    except Exception as e:
        return str(e), 0


# ============================================================
# 主要功能
# ============================================================


def get_version():
    """获取新版本号"""
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE, "r") as f:
            current = f.read().strip()
    else:
        current = "1.0.0"

    parts = current.split(".")
    if len(parts) == 3:
        major, minor, patch = parts
        new_version = f"{major}.{minor}.{int(patch) + 1}"
    else:
        new_version = "1.0.1"

    with open(VERSION_FILE, "w") as f:
        f.write(new_version)

    return new_version


def check_devtools():
    """检查微信开发者工具是否运行"""
    log("检查微信开发者工具...")
    result, status = http_get(f"http://127.0.0.1:{DEVTOOLS_PORT}", timeout=5)
    if status == 0:
        log("微信开发者工具未运行或端口未开启", "ERROR")
        return False
    log("微信开发者工具已运行")
    return True


def upload_code(version, desc):
    """上传代码"""
    log(f"上传代码 (版本: {version})...")
    # URL 编码参数
    params = urllib.parse.urlencode(
        {"project": PROJECT_DIR, "version": version, "desc": desc}
    )
    url = f"http://127.0.0.1:{DEVTOOLS_PORT}/v2/upload?{params}"
    result, status = http_get(url, timeout=120)

    if status == 200:
        try:
            data = json.loads(result)
            if data.get("success"):
                size = data.get("info", {}).get("size", {}).get("total", 0)
                log(f"上传成功！包大小: {size / 1024:.2f} KB")
                return True
        except:
            pass

    log(f"上传失败: {result}", "ERROR")
    return False


def get_preview_qr():
    """获取预览二维码"""
    log("生成预览二维码...")
    params = urllib.parse.urlencode(
        {"project": PROJECT_DIR, "format": "image", "qroutput": "terminal"}
    )
    url = f"http://127.0.0.1:{DEVTOOLS_PORT}/v2/preview?{params}"
    result, status = http_get(url, timeout=60)

    if status == 200:
        # 检查是否是图片
        if len(result) > 1000 and not result.startswith(b"{"):
            output_path = os.path.join(OUTPUT_DIR, "preview-qr.png")
            with open(output_path, "wb") as f:
                f.write(result)
            log(f"预览二维码已保存: {output_path}")
            return True

    log("预览二维码生成失败", "ERROR")
    return False


def get_access_token():
    """获取 access_token"""
    log("获取 access_token...")
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={APPSECRET}"
    result, status = http_get(url, timeout=30)

    if status == 200:
        data = json.loads(result)
        if "access_token" in data:
            log(f"access_token 获取成功（有效期: {data.get('expires_in')}s）")
            return data["access_token"]
        else:
            log(f"获取失败: {data}", "ERROR")
    return None


def get_experience_qr(access_token):
    """获取体验版二维码"""
    log("获取体验版二维码...")
    url = f"https://api.weixin.qq.com/wxa/get_qrcode?access_token={access_token}"
    result, status = http_get(url, timeout=30)

    if status == 200:
        # 检查是否是图片
        if len(result) > 1000 and not result.startswith(b"{"):
            output_path = os.path.join(OUTPUT_DIR, "experience-qr.png")
            with open(output_path, "wb") as f:
                f.write(result)
            log(f"体验版二维码已保存: {output_path}")
            return True
        else:
            # 可能是错误响应
            try:
                data = json.loads(result)
                log(f"获取失败: {data}", "ERROR")
            except:
                log(f"获取失败: {result}", "ERROR")
    else:
        log(f"请求失败: HTTP {status}", "ERROR")
    return False


def set_experience_version(access_token):
    """设置体验版"""
    log("设置体验版...")
    url = f"https://api.weixin.qq.com/wxa/set_experiencing_version?access_token={access_token}"
    data = json.dumps({"action": "set"}).encode("utf-8")
    result, status = http_post(url, data=data, timeout=30)

    if status == 200:
        try:
            resp = json.loads(result)
            if resp.get("errcode") == 0:
                log("体验版设置成功！")
                return True
            else:
                log(f"设置失败: {resp.get('errmsg', resp)}", "ERROR")
        except:
            log(f"设置失败: {result}", "ERROR")
    else:
        log(f"请求失败: HTTP {status}", "ERROR")
    return False


# ============================================================
# 主流程
# ============================================================


def main():
    # 获取版本描述
    desc = sys.argv[1] if len(sys.argv) > 1 else "Auto release"

    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 获取新版本号
    version = get_version()

    print("=" * 50)
    print("  小程序自动发布脚本")
    print("=" * 50)
    print(f"  APPID: {APPID}")
    print(f"  版本号: {version}")
    print(f"  描述: {desc}")
    print("=" * 50)

    # Step 1: 检查微信开发者工具
    if not check_devtools():
        sys.exit(1)

    # Step 2: 上传代码
    if not upload_code(version, desc):
        sys.exit(1)

    # Step 3: 获取预览二维码
    get_preview_qr()

    # Step 4: 设置体验版并获取体验码
    token = get_access_token()
    if token:
        # 先设置体验版
        set_experience_version(token)
        # 再获取体验版二维码
        get_experience_qr(token)

    # 完成
    print()
    print("=" * 50)
    print("  ✅ 全部完成！")
    print("=" * 50)
    print()
    print(f"  版本号: {version}")
    print(f"  预览码: {OUTPUT_DIR}/preview-qr.png")
    print(f"  体验码: {OUTPUT_DIR}/experience-qr.png")
    print()
    print("  下一步：")
    print("  1. 扫描预览码或体验码验证功能")
    print("  2. 确认无误后在后台提交审核")
    print("=" * 50)


if __name__ == "__main__":
    main()
