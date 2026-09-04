# pi-freebuff

Extension สำหรับเชื่อมต่อ [Freebuff2API](https://github.com/Quorinex/Freebuff2API) เข้ากับ **pi CLI** พร้อมระบบ Auto-Discovery ดึงรายชื่อโมเดลที่ใช้งานได้อัตโนมัติ

## คุณสมบัติ (Features)

- **Dynamic Model Discovery:** ดึงรายชื่อโมเดลทั้งหมดที่ Freebuff ให้บริการจาก `/v1/models` มาลงทะเบียนใน pi CLI โดยอัตโนมัติเมื่อเริ่มโปรแกรม
- **Fallback Safe:** หาก Freebuff2API ยังไม่ได้เปิด จะใช้โมเดลมาตรฐานเริ่มต้นทันทีโดยไม่ค้างหรือไม่ทำให้ pi แฮงก์
- **`/freebuff` Command:** พิมพ์คำสั่ง `/freebuff` ใน pi เพื่อเช็คสถานะการเชื่อมต่อ และเปิดดูรายชื่อโมเดลสดๆ ที่กำลังออนไลน์ได้ตลอดเวลา
- **Ready to Share:** โครงสร้างเป็น pi-package มาตรฐาน สามารถติดตั้งผ่าน Git, npm หรือ local path ได้ทันที

---

## วิธีติดตั้งและใช้งาน

### 1. ติดตั้ง Extension นี้ใน pi

เลือกวิธีใดวิธีหนึ่ง:

**ติดตั้งจาก Local Path (เครื่องตัวเอง):**
```bash
pi install /path/to/freebufftopi
```

**หรือติดตั้งผ่าน Git (เมื่อนำขึ้น GitHub):**
```bash
pi install git:github.com/<username>/pi-freebuff
```

**หรือทดลองรันแบบชั่วคราว:**
```bash
pi -e ./index.ts
```

---

### 2. รัน Freebuff2API Server

1. รับ Token จากเว็บ [freebuff.llm.pm](https://freebuff.llm.pm) หรือล็อกอินผ่าน `npm i -g freebuff && freebuff` (Token จะอยู่ใน `~/.config/manicode/credentials.json`)
2. รัน proxy server ด้วย Docker:
   ```bash
   docker run -d --name freebuff2api \
     -p 8080:8080 \
     -e AUTH_TOKENS="<AUTH_TOKEN_ของคุณ>" \
     --restart unless-stopped \
     ghcr.io/quorinex/freebuff2api:latest
   ```

---

### 3. เรียกใช้งานใน pi CLI

- ดูโมเดลทั้งหมดที่ดึงมาจาก Freebuff:
  ```bash
  pi --list-models | grep freebuff
  ```
- ใช้งานโมเดลโดยตรง:
  ```bash
  pi --model freebuff/google/gemini-2.5-flash-lite
  ```
- ใน TUI พิมพ์ `/model` เพื่อเลือกโมเดล หรือพิมพ์ `/freebuff` เพื่อตรวจสอบการเชื่อมต่อและดูรายชื่อโมเดลสดๆ

---

## Configuration (ตัวเลือกเสริม)

สามารถกำหนด Environment Variables ได้:
- `FREEBUFF_BASE_URL`: URL ของ Freebuff2API (ค่าเริ่มต้น `http://localhost:8080/v1`)
- `FREEBUFF_API_KEY`: API Key กรณีเปิดใช้งาน `API_KEYS` ใน Freebuff2API (ค่าเริ่มต้น `freebuff`)
