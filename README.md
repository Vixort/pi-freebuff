# pi-freebuff

Extension สำหรับเชื่อมต่อ **Freebuff (Codebuff)** เข้ากับ **pi CLI** แบบ **Embedded Native (All-in-One)** โดย **ไม่ต้องใช้ Docker, ไม่ต้องลง Go และไม่มี Background Service ภายนอก**

---

## จุดเด่น (Highlights)

- **Zero-Docker / Zero-Daemon:** ทำงานเป็น in-process adapter ขนาดเบาภายใน pi CLI เปิดและปิดตามรอบการใช้งานของ pi ทันที
- **Auto Auth Token:** ตรวจพบและโหลด `authToken` จาก `~/.config/manicode/credentials.json` ให้อัตโนมัติ (หากเคยล็อกอินผ่าน `freebuff` CLI ไว้แล้ว ไม่ต้องตั้งค่าอะไรเลย)
- **Auto Model Discovery:** ดึงรายชื่อโมเดลฟรีที่โควต้าของคุณใช้งานได้แบบสดๆ เช่น `deepseek/deepseek-v4-flash`, `mimo/mimo-v2.5`, `upstage/solar-pro4`, `minimax/minimax-m3`
- **Sticky Token Pool & Auto-Rotation:** รองรับการใส่หลายบัญชีพร้อมกัน โดยระบบจะใช้บัญชีเดิมแบบ **Sticky** (ใช้ต่อเนื่อง 25 ครั้ง หรือ 1 ชั่วโมง) เพื่อจำลองพฤติกรรมคนใช้งานจริง ไม่สลับไปมาถี่ๆ จนผิดธรรมชาติ และสลับไปบัญชีสำรองทันทีหากบัญชีหลักติด Rate Limit หรือโควต้าหมด
- **Dynamic Session & Model Switching:** จัดการคิว Waiting Room และสลับโมเดลให้อัตโนมัติเบื้องหลัง
- **คำสั่ง `/freebuff` ใน TUI:** 
  - เพิ่มหรือสลับ Token ได้ใน TUI ทันที
  - เรียกดูสถานะ Token Pool, เช็คโควต้าประจำวัน (Quota used/limit), และดูรายการโมเดลได้ตลอดเวลา

---

## คำสั่งใน pi CLI (`/freebuff`)

คุณสามารถจัดการบัญชี Freebuff ได้โดยตรงจากหน้าต่าง pi CLI:

- `/freebuff` : เปิดเมนูควบคุม (มีปุ่มกดเพิ่ม Token, สลับบัญชี, ดูโควต้า และเลือกโมเดล)
- `/freebuff login` : แสดงลิงก์ล็อกอิน [freebuff.llm.pm](https://freebuff.llm.pm) และเปิดกล่องข้อความให้วาง Token ทันที
- `/freebuff add <TOKEN>` : เพิ่ม Token ใหม่เข้า Token Pool ทันที
- `/freebuff rotate` : บังคับสลับไปใช้บัญชีถัดไปใน Pool ทันที
- `/model` : สลับโมเดลที่ต้องการใช้งาน (เช่น DeepSeek V4 Flash 07/31, MiMo 2.5, Solar Pro 4)

---

## การจัดการ Token และอัปเดต (Updater Script)

ในโปรเจกต์นี้มีสคริปต์ `update.sh` สำหรับจัดการบัญชีและอัปเดต:

```bash
# 1. ดูรายการ Token ทั้งหมดที่มีในระบบ
./update.sh list

# 2. ตั้งค่า Token หลัก (Account 1)
./update.sh <TOKEN_หลัก>

# 3. เพิ่ม Token สำรองเข้า Pool สำหรับสลับใช้งาน (Account 2, 3...)
./update.sh add <TOKEN_สำรอง>

# 4. ดึงอัปเดตโค้ดล่าสุดจาก Git
./update.sh
```

---

## วิธีติดตั้งและใช้งาน

### 1. ติดตั้ง Extension เข้า pi CLI

เลือกวิธีใดวิธีหนึ่ง:

**ติดตั้งจากโฟลเดอร์นี้ในเครื่อง:**
```bash
pi install /home/null/Projects/freebufftopi
```

**หรือติดตั้งผ่าน Git (สำหรับแชร์ให้ผู้อื่น):**
```bash
pi install git:github.com/<username>/pi-freebuff
```

**หรือทดลองรันชั่วคราว:**
```bash
pi -e ./index.ts
```

---

### 2. เตรียม Auth Token (ทำเพียงครั้งแรก)

หากคุณเคยติดตั้งและล็อกอิน `freebuff` CLI ไว้แล้ว ตัว extension จะดึง token มาใช้ให้อัตโนมัติโดยที่คุณไม่ต้องทำอะไรเลย

หากยังไม่เคยมี token ให้เลือกทำวิธีใดวิธีหนึ่ง:
- **วิธีที่ 1 (ผ่าน CLI):**
  ```bash
  npm i -g freebuff
  freebuff # ล็อกอินครั้งแรก token จะถูกบันทึกลง ~/.config/manicode/credentials.json
  ```
- **วิธีที่ 2 (ผ่าน Environment Variable):**
  รับ token จาก [freebuff.llm.pm](https://freebuff.llm.pm) แล้วตั้งค่า:
  ```bash
  export FREEBUFF_AUTH_TOKEN="<token_ของคุณ>"
  ```

---

### 3. เรียกใช้งานใน pi CLI

- **ดูรายการโมเดลที่ใช้งานได้:**
  ```bash
  pi --list-models | grep freebuff
  ```

- **เริ่มสนทนาผ่านโมเดลของ Freebuff:**
  ```bash
  pi --model freebuff/deepseek/deepseek-v4-flash
  ```
  หรือ:
  ```bash
  pi --model freebuff/mimo/mimo-v2.5
  ```

- **ในหน้าต่าง Interactive TUI:**
  - พิมพ์ `/model` เพื่อเลือกโมเดลใต้กลุ่ม **Freebuff (Native)**
  - พิมพ์ `/freebuff` เพื่อดูสถานะเซิร์ฟเวอร์, ดูโควต้าการใช้งาน และคำแนะนำการสลับโมเดล

---

## License

MIT
