# Plan: Anti-Ban & Stealth Protection Architecture for pi-freebuff

## Context
ในการใช้งาน Freebuff API มีความเสี่ยงที่บัญชีอาจถูกระงับ (`403 {"status":"banned"}`) หากระบบ Anti-Abuse ของ Codebuff ตรวจพบพฤติกรรมผิดปกติ เช่น:
1. การยิงคำขอเร็วเกินไปหรือต่อเนื่องโดยไม่มีช่วงหน่วงเวลา (Bot-like burst traffic)
2. การยิงจนทะลุโควต้าประจำวัน (`429 rate_limited`) ซ้ำๆ จนระบบมองว่าเป็นสแปม
3. การทิ้ง Session ค้างไว้โดยไม่ปิดอย่างถูกต้อง ทำให้เกิด `session_superseded`
4. การที่หลายบัญชียิงพร้อมกันจาก IP เดิมด้วยรูปแบบที่ผิดธรรมชาติ

เป้าหมายคือการสร้าง **5 ชั้นเกราะป้องกัน (5-Layer Anti-Ban Shield)** เข้าไปใน `index.ts` เพื่อให้การใช้งานผ่าน pi CLI ปลอดภัยและดูเหมือนการใช้งานผ่าน Freebuff CLI ตัวจริงมากที่สุด

---

## Approach (ระบบป้องกัน 5 ชั้น)

### 1. Proactive Quota Guard (สลับบัญชีก่อนชนเพดาน)
- เซิร์ฟเวอร์ Codebuff ส่งข้อมูลโควต้ากลับมาใน Session ทุกครั้ง (`recentCount` และ `limit`)
- **การทำงาน:** เมื่อโควต้าบัญชีปัจจุบันใช้ไปถึง 90% (เช่น `recentCount >= limit - 0.5`) ระบบจะสลับไปบัญชีถัดไปใน Pool ล่วงหน้าทันที **โดยไม่ต้องรอให้เจอ 429 Rate Limit** ซึ่งเป็นตัวกระตุ้นให้เซิร์ฟเวอร์เพ่งเล็งบัญชี

### 2. Humanized Jitter & Request Pacing (หน่วงเวลาสุ่มเสมือนมนุษย์)
- เมื่อมี Tool Loops ติดต่อกัน (เช่น bash -> read -> edit) การยิงติดๆ กันใน 0-50ms จะถูกตรวจจับได้ง่าย
- **การทำงาน:** เพิ่ม Micro-Jitter หน่วงเวลาแบบสุ่ม 250ms - 550ms ระหว่าง Request ถี่ๆ เพื่อเลียนแบบพฤติกรรมมนุษย์

### 3. Graceful Session Lifecycle Management (เก็บกวาด Session สะอาดหมดจด)
- เมื่อ pi ปิดการทำงาน (`session_shutdown`) หรือเมื่อมีการสลับบัญชี:
- **การทำงาน:** ส่งคำสั่ง `DELETE /api/v1/freebuff/session` เสมอ เพื่อคืนโควต้าห้องรอ ไม่ทิ้ง session ร้างไว้บนคลาวด์จนเกิด `session_superseded` ในรอบถัดไป

### 4. Circuit Breaker & Progressive Cooldown (ตัดวงจรเมื่อบัญชีสะดุด)
- หากบัญชีใดเริ่มมีสัญญาณเตือน (เช่น เจอ 429 หรือ Waiting Room Queued):
- **การทำงาน:** พักบัญชีนั้นทันที 60 นาที (Cooldown) และสลับไปบัญชีอื่นทันที **ห้ามยิงกระหน่ำซ้ำบัญชีเดิมเด็ดขาด** เพื่อป้องกันไม่ให้ความผิดพลาดธรรมดาบานปลายกลายเป็น Hard Ban

### 5. HTTP Proxy Support (รองรับการมุด IP / Cloudflare WARP)
- เพิ่มตัวเลือก `FREEBUFF_HTTP_PROXY` / `HTTP_PROXY`:
- **การทำงาน:** หากผู้ใช้ระบุ Proxy ตัว Extension จะส่งคำขอผ่าน Proxy Agent (ใช้ `undici.ProxyAgent` หรือ `node:https`) เพื่อให้ผู้ใช้สามารถเปลี่ยน IP หรือใช้ WARP ได้อย่างอิสระ

---

## Files to Modify
- `index.ts`:
  - เพิ่ม `ProactiveQuotaGuard` ตรวจสอบ `recentCount` ใน Session
  - เพิ่ม `HumanizedJitter` (delay สุ่มระหว่าง request)
  - ปรับปรุง `cleanSessionOnExit` ใน event `session_shutdown`
  - เพิ่มการรองรับ Proxy Dispatcher สำหรับ outbound fetch
- `README.md`:
  - อัปเดตคำแนะนำและตัวเลือก Environment Variables เช่น `FREEBUFF_HTTP_PROXY`

---

## Reuse
- Node.js built-in `node:http`, `node:https`, `crypto`
- Vercel AI SDK request signature ที่จำลองอย่างสมบูรณ์ใน `index.ts`
- Token Pool ที่สร้างไว้แล้ว

---

## Steps

- [ ] **Step 1: Proactive Quota Guard**
  - ดึงค่า `rateLimit` จาก session response (`recentCount`, `limit`)
  - สร้างเงื่อนไขตรวจสอบก่อนส่งคำขอ: ถ้าบัญชีปัจจุบันใกล้เต็มเพดาน ให้เรียก `pool.rotateNext()` สลับไปบัญชีสำรองทันที
- [ ] **Step 2: Humanized Jitter & Micro-Delays**
  - คำนวณช่วงเวลาระหว่าง request ล่าสุด ถ้าเร็วกว่า 500ms ให้สุ่ม delay (250-550ms) ก่อนยิง upstream
- [ ] **Step 3: Comprehensive Session Cleanup**
  - เพิ่มฟังก์ชันเคลียร์ session ของทุกบัญชีใน pool เมื่อ pi ส่งสัญญาณ `session_shutdown` หรือ `process.on('exit')`
- [ ] **Step 4: Circuit Breaker & Safety Logging**
  - ปรับปรุงการจัดการ Error เมื่อเจอสัญญาณ 429/428 ให้ติด cooldown ทันทีและแจ้งเตือนผู้ใช้ใน TUI
- [ ] **Step 5: Upstream Proxy Support**
  - รองรับการตั้งค่า `FREEBUFF_HTTP_PROXY` ผ่าน custom fetch dispatcher
- [ ] **Step 6: Documentation & Verification**
  - อัปเดต `README.md` และทดสอบ offline verification

---

## Verification
1. ตรวจสอบ Offline ด้วย unit checks: ตรวจสอบว่า `ProactiveQuotaGuard` สลับบัญชีเมื่อ `recentCount >= limit - 0.5`
2. ทดสอบ Jitter Delay: จำลองยิงคำขอ 2 ครั้งติดกัน ตรวจสอบว่ามี delay เสริมเข้ามาตามที่กำหนด
3. ทดสอบการปิด Session สะอาดเมื่อ pi ออกจากโปรแกรม
