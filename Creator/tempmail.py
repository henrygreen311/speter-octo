#!/usr/bin/env python3
"""
tempmail.py — Minimal Mail.tm client, auto-extracts 6-digit verification codes.

Commands:
  python3 tempmail.py new           # prints: email\npassword
  python3 tempmail.py list          # prints saved accounts as email\npassword\n...
  python3 tempmail.py inbox <email> # prints only the verification code (XXX XXX) if found,
                                    # otherwise prints the message body.
"""
import os, json, urllib.request, urllib.error, uuid, re

BASE = "https://api.mail.tm"
ACCOUNTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tempmail_accounts.json")

def load_accounts():
    if not os.path.exists(ACCOUNTS_FILE):
        return {}
    try:
        with open(ACCOUNTS_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {}
            return json.loads(content)
    except (json.JSONDecodeError, OSError):
        # Recreate/return empty if file corrupted
        return {}

def save_accounts(data):
    with open(ACCOUNTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def req(url, data=None, headers=None):
    if headers is None:
        headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def new_email():
    domains = req(f"{BASE}/domains")
    domain = domains["hydra:member"][0]["domain"]
    local = str(uuid.uuid4())[:8]
    address = f"{local}@{domain}"
    password = str(uuid.uuid4())

    payload = json.dumps({"address": address, "password": password}).encode()
    try:
        req(f"{BASE}/accounts", payload)
    except urllib.error.HTTPError as e:
        print("❌ Failed to create account:", e)
        return

    accounts = load_accounts()
    accounts[address] = {"address": address, "password": password}
    save_accounts(accounts)

    # Minimal output: email then password
    print(address)
    print(password)

def list_emails():
    accounts = load_accounts()
    if not accounts:
        print("⚠️ No saved emails yet.")
        return
    for addr, creds in accounts.items():
        print(f"{addr}\n{creds['password']}\n")

def _extract_code_from_text(text):
    """
    Find a 6-digit verification code in text. Accept forms:
      - 6 contiguous digits: 852559
      - grouped by space: 852 559
    Returns normalized 'XXX XXX' string or None.
    """
    if not text:
        return None
    # search for "123456" or "123 456" or similar variants
    patterns = [
        r'\b(\d{3}\s?\d{3})\b',  # 3+space?+3
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            digits = re.sub(r'\D', '', m.group(1))
            if len(digits) == 6:
                return f"{digits[:3]} {digits[3:]}"
    return None

def inbox(address):
    accounts = load_accounts()
    if address not in accounts:
        print("❌ Email not found.")
        return

    password = accounts[address]["password"]
    login_payload = json.dumps({"address": address, "password": password}).encode()
    auth = req(f"{BASE}/token", login_payload)
    token = auth["token"]
    headers = {"Authorization": f"Bearer {token}"}

    messages = req(f"{BASE}/messages?page=1", headers=headers)
    mails = messages.get("hydra:member", [])

    if not mails:
        print("")  # print nothing (or could print a message). Keeping output minimal.
        return

    # mail.tm returns newest first; take the first
    latest = mails[0]
    msg_id = latest["id"]
    content = req(f"{BASE}/messages/{msg_id}", headers=headers)
    body = content.get("text") or content.get("html") or ""

    # Extract code
    code = _extract_code_from_text(body)
    if code:
        print(code)
    else:
        # fallback: print full body (trimmed)
        print(body.strip())

def main():
    import sys
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return

    cmd = sys.argv[1].lower()
    if cmd == "new":
        new_email()
    elif cmd == "list":
        list_emails()
    elif cmd == "inbox" and len(sys.argv) == 3:
        inbox(sys.argv[2])
    else:
        print("❌ Invalid command or missing arguments.")

if __name__ == "__main__":
    main()