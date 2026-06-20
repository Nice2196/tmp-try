#!/usr/bin/env python3.11
"""
小程序自动发布脚本（使用 miniprogram-ci）
功能：上传代码 → 设置体验版 → 获取预览码 → 获取体验码
用法：python3.11 scripts/auto-release.py [版本描述]
"""

import json
import os
import ssl
import subprocess
import sys
import urllib.request
from datetime import datetime

# 创建忽略 SSL 证书验证的上下文
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# ============================================================
# 配置
# ============================================================
APPID = "wx73b9c9702f51e839"
APPSECRET = "b4165d1d0d4b6a1d27bcf4bd1219a2dc"
PROJECT_DIR = "/Volumes/macSdcard/AICoding/smart-hours"
KEY_PATH = os.path.join(PROJECT_DIR, f"private.{APPID}.key")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "release")
VERSION_FILE = os.path.join(PROJECT_DIR, ".version")

# ============================================================
# 工具函数
# ============================================================


def log(msg, level="INFO"):
    """打印日志"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


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


def check_prerequisites():
    """检查前提条件"""
    log("检查前提条件...")

    # 检查密钥文件
    if not os.path.exists(KEY_PATH):
        log(f"密钥文件不存在: {KEY_PATH}", "ERROR")
        log("请从微信公众平台下载代码上传密钥", "ERROR")
        return False
    log("密钥文件存在")

    # 检查 miniprogram-ci
    try:
        result = subprocess.run(
            ["npx", "miniprogram-ci", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        log(f"miniprogram-ci 版本: {result.stdout.strip()}")
    except Exception as e:
        log(f"miniprogram-ci 未安装: {e}", "ERROR")
        return False

    return True


def upload_code(version, desc):
    """上传代码"""
    log(f"上传代码 (版本: {version})...")

    cmd = [
        "npx",
        "miniprogram-ci",
        "upload",
        "--project",
        PROJECT_DIR,
        "--appid",
        APPID,
        "--private-key-path",
        KEY_PATH,
        "--version",
        version,
        "--desc",
        desc,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            log("上传成功！")
            # 提取包大小信息
            for line in result.stdout.split("\n"):
                if "size" in line.lower() or "包大小" in line:
                    log(line.strip())
            return True
        else:
            log(f"上传失败: {result.stderr}", "ERROR")
            return False
    except subprocess.TimeoutExpired:
        log("上传超时", "ERROR")
        return False
    except Exception as e:
        log(f"上传异常: {e}", "ERROR")
        return False


def set_experience_version(version):
    """设置体验版"""
    log("设置体验版...")

    cmd = [
        "npx",
        "miniprogram-ci",
        "set-experience-version",
        "--project",
        PROJECT_DIR,
        "--appid",
        APPID,
        "--private-key-path",
        KEY_PATH,
        "--version",
        version,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            log("体验版设置成功！")
            return True
        else:
            log(f"设置失败: {result.stderr}", "ERROR")
            return False
    except Exception as e:
        log(f"设置异常: {e}", "ERROR")
        return False


def get_experience_qr(version):
    """获取体验版二维码"""
    log("获取体验版二维码...")

    cmd = [
        "npx",
        "miniprogram-ci",
        "preview",
        "--project",
        PROJECT_DIR,
        "--appid",
        APPID,
        "--private-key-path",
        KEY_PATH,
        "--version",
        version,
        "--desc",
        "体验版",
        "--qrcode-format",
        "image",
        "--qrcode-output",
        os.path.join(OUTPUT_DIR, "experience-qr.png"),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            log(f"体验版二维码已保存: {OUTPUT_DIR}/experience-qr.png")
            return True
        else:
            log(f"获取失败: {result.stderr}", "ERROR")
            return False
    except Exception as e:
        log(f"获取异常: {e}", "ERROR")
        return False


def get_preview_qr(version):
    """获取预览二维码"""
    log("生成预览二维码...")

    cmd = [
        "npx",
        "miniprogram-ci",
        "preview",
        "--project",
        PROJECT_DIR,
        "--appid",
        APPID,
        "--private-key-path",
        KEY_PATH,
        "--version",
        version,
        "--desc",
        "预览版",
        "--qrcode-format",
        "image",
        "--qrcode-output",
        os.path.join(OUTPUT_DIR, "preview-qr.png"),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            log(f"预览二维码已保存: {OUTPUT_DIR}/preview-qr.png")
            return True
        else:
            log(f"生成失败: {result.stderr}", "ERROR")
            return False
    except Exception as e:
        log(f"生成异常: {e}", "ERROR")
        return False


def get_access_token():
    """获取 access_token"""
    log("获取 access_token...")
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={APPSECRET}"
    try:
        with urllib.request.urlopen(url, timeout=30, context=ssl_context) as response:
            data = json.loads(response.read().decode("utf-8"))
            if "access_token" in data:
                log(f"access_token 获取成功（有效期: {data.get('expires_in')}s）")
                return data["access_token"]
            else:
                log(f"获取失败: {data}", "ERROR")
                return None
    except Exception as e:
        log(f"获取异常: {e}", "ERROR")
        return None


def get_experience_qr_by_api():
    """使用微信 API 获取体验版二维码"""
    log("通过 API 获取体验版二维码...")

    # 获取 access_token
    token = get_access_token()
    if not token:
        return False

    # 获取体验码
    url = f"https://api.weixin.qq.com/wxa/get_qrcode?access_token={token}"
    try:
        with urllib.request.urlopen(url, timeout=30, context=ssl_context) as response:
            result = response.read()
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
                except Exception:
                    log(f"获取失败: {result}", "ERROR")
                return False
    except Exception as e:
        log(f"获取异常: {e}", "ERROR")
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
    print("  小程序自动发布脚本 (miniprogram-ci)")
    print("=" * 50)
    print(f"  APPID: {APPID}")
    print(f"  版本号: {version}")
    print(f"  描述: {desc}")
    print("=" * 50)

    # Step 1: 检查前提条件
    if not check_prerequisites():
        sys.exit(1)

    # Step 2: 上传代码
    if not upload_code(version, desc):
        sys.exit(1)

    # Step 3: 设置体验版
    set_experience_version(version)

    # Step 4: 生成预览码
    get_preview_qr(version)

    # Step 5: 通过 API 获取体验码
    get_experience_qr_by_api()

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
