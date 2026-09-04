# Plan: Embedded Native Freebuff Extension for pi CLI (No Docker)

## Context
ผู้ใช้ต้องการใช้งาน Freebuff บน **pi CLI** โดยไม่ต้องการรัน Docker หรือติดตั้ง Go เพิ่มเติม เนื่องจาก Docker เปลืองทรัพยากร และต้องเปิดโปรเซสภายนอกค้างไว้ 

จากการตรวจสอบเชิงลึก:
- เซิร์ฟเวอร์ของ Freebuff (`www.codebuff.com`) เป็น OpenAI-compatible SSE stream อยู่แล้ว
- สิ่งที่ต้องการเพิ่มเติมมีเพียง:
  1. การยืนยันตัวตนด้วย Auth Token (ซึ่งมีอยู่ในเครื่องที่ `~/.config/manicode/credentials.json` อยู่แล้ว)
  2. การขอ Waiting Room Session (`/api/v1/freebuff/session`)
  3. การเปิด/ปิด Agent Run (`/api/v1/agent-runs`)
  4. การใส่ System Prompt Marker และ Metadata ที่จำเป็น
- เราสามารถทำสิ่งเหล่านี้ทั้งหมดผ่าน **In-Process Lightweight Adapter** ใน Node.js (ภาษาที่ pi ใช้อยู่แล้ว) ฝังใน Extension ตัวเดียวจบ

---

## Approach

สถาปัตยกรรมแบบ **Embedded Native Extension**:
```
┌────────────────────────────────────────────────────────┐
│                        pi CLI                          │
│                                                        │
│  [pi Agent Engine] ──(HTTP)──> [In-Process Adapter]   │
│  (openai-completions)           (127.0.0.1:random)     │
│                                        │               │
└────────────────────────────────────────┼───────────────┘
                                         ▼ (HTTPS)
                              [https://www.codebuff.com]
```

1. **Auto-Auth Detection:** ดึง Token อัตโนมัติจาก `~/.config/manicode/credentials.json` หรือ Environment Variable `FREEBUFF_AUTH_TOKEN` (Zero-Config สำหรับผู้ที่เคยใช้ freebuff CLI)
2. **Ephemeral In-Process Server:** เมื่อ pi เริ่มทำงาน Extension จะเปิด HTTP server เล็กๆ บนพอร์ตสุ่ม `127.0.0.1:0` เพื่อรอรับ request จาก pi เอง
3. **Session & Run Lifecycle:**
   - ขอ `instanceId` จาก `/api/v1/freebuff/session` (แคชไว้จนกว่าจะหมดอายุ)
   - สั่ง `START` run ก่อนส่ง completion และสั่ง `FINISH` เมื่อ stream จบ
   - เสียบ System Prompt Marker ("You are Buffy...") และ `codebuff_metadata`
   - Pipe SSE Stream กลับเข้า pi CLI โดยตรง
4. **Clean Teardown:** ปิด server เมื่อ pi ปิดการทำงาน ไม่มีพอร์ตค้างในเครื่อง
5. **Command `/freebuff`:** ดูรายชื่อโมเดล โควต้าคงเหลือ (Daily Limit / Remaining) และสถานะคิวแบบสดๆ

---

## Files to Modify
- `index.ts`: เขียนตัว In-Process Adapter, Session/Run Manager และลงทะเบียน Provider ใน pi
- `package.json`: อัปเดต metadata ของ package สำหรับแจกจ่าย
- `README.md`: อัปเดตวิธีใช้งานแบบไม่ต้องใช้ Docker

---

## Reuse
- **Node.js Stdlib:** `node:http`, `node:fs`, `node:path`, `node:os`, `node:crypto` (ไม่มี third-party dependencies)
- **Official Credentials:** ดึง token จาก `~/.config/manicode/credentials.json` ที่มีอยู่แล้วในเครื่อง
- **pi API:** `pi.registerProvider()`, `pi.registerCommand()`, `pi.on("session_shutdown")`

---

## Steps

- [ ] **Step 1: Auth Token & Config Loader**
  - อ่าน `authToken` จาก `~/.config/manicode/credentials.json`
  - รองรับ fallback ผ่าน `FREEBUFF_AUTH_TOKEN`
- [ ] **Step 2: Codebuff Session & Run Manager**
  - ฟังก์ชันจัดการ Session (`/api/v1/freebuff/session`) รองรับตรวจเช็ค expiry
  - ฟังก์ชันสร้างและจบ Agent Run (`/api/v1/agent-runs`)
  - แมปโมเดลกับ Agent ID ที่ถูกต้อง (`deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`, `mimo/mimo-v2.5`, `minimax/minimax-m3`, `upstage/solar-pro4`)
- [ ] **Step 3: Lightweight In-Process HTTP Proxy**
  - สร้าง local HTTP server ด้วย `node:http` บน `127.0.0.1:0`
  - ดักจับ `/v1/chat/completions` เพื่อ inject metadata และ pipe SSE stream
  - ปิด server ใน event `session_shutdown`
- [ ] **Step 4: Dynamic Model Registration & Command**
  - ลงทะเบียน Provider `freebuff` ใน pi ชี้ไปที่ local ephemeral port
  - เพิ่มคำสั่ง `/freebuff` ใน TUI เพื่อเช็คโควต้าและสลับโมเดล
- [ ] **Step 5: Documentation & Packaging**
  - ปรับปรุง `README.md` ให้เป็นคู่มือแบบไม่ต้องใช้ Docker

---

## Verification
1. **การค้นพบโมเดล:** รัน `pi -e ./index.ts --list-models | grep freebuff` เพื่อตรวจสอบว่าโมเดลแสดงครบถ้วน
2. **การสนทนาจริง (Streaming Check):** รันคำสั่งทดสอบ:
   ```bash
   pi -e ./index.ts --model freebuff/deepseek/deepseek-v4-flash -p "ตอบคำว่า PONYTAIL"
   ```
   และตรวจสอบว่าคำตอบ Stream กลับมาสมบูรณ์โดยไม่ต้องเปิดโปรแกรมภายนอก
3. **คำสั่งใน TUI:** ทดสอบเรียก `/freebuff` ใน session เพื่อดูโควต้าและสถานะคิว
