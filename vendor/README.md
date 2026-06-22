# vendor/

Thư viện bên thứ ba (KHÔNG sửa tay).

- **tabulator.min.js** — tách từ dòng nhúng **5715** của V4-54 (~443k ký tự,
  bản full Tabulator có kèm luxon + hook xuất XLSX). Đây là "thủ phạm" làm
  file gốc nặng & tốn token. Khi tách (Phase 1): copy nguyên dòng 5715 ra đây.
- **tabulator.min.css** — tải bản CSS Tabulator tương ứng (cùng version) HOẶC
  tách phần CSS Tabulator từ khối <style> của V4-54.

> Firebase & JSZip nạp thẳng từ CDN trong index.html nên không để ở đây.
