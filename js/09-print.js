/* ============================================================
   IN DON — dung bieu mau, in le / in hang loat, nhat ky in
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== v4: MODULE IN ĐƠN (nguồn: 2023_HSVC Timekeeping Form.xlsm) =================== */
/* Logo Hyosung Vina Chemicals — lấy nguyên từ xl/media/image1.jpeg trong file
   biểu mẫu gốc của công ty (358 x 86 px). Bản nhúng cũ bị mất 1 byte cuối nên
   trình duyệt vẽ ra ảnh vỡ; bản này đủ dấu kết thúc EOI (FF D9). */
const LOGO_B64='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA3ADcAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCABWAWYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD97PFvizw14D8L6j428Za3baZpGkWMt5qmpXsojhtbeJC8ksjHhUVVLEngAE14EP8Agr3/AMEuipY/t9/CcY6g+OLL/wCOV9B63oukeJNHuvD/AIg0q2vrC+t3t72yvIFlhuIXUq8bowIdWUkFSCCCQa/AP/g7Z/Zg/Z1/Z+1j4G638CvgX4R8GXHiCLxKNcfwr4et9P8At/kNpZiaUQIokKedLgkZAcjOOK+r4PybLeIc4hl+JlOMql+Vx5bK0W9U11t0NKcYzlZn68j/AIK+f8EuD/zf/wDCX/wubL/45Xq/wK/aS+Af7TvhW58c/s7/ABg8O+NdGs9QawutU8M6tFeQRXKxpI0LPExAcJLGxU84dT3r+PP9hzwH4U+KX7avwg+GfjvSlv8ARPEXxQ0DTNZsZGIW5tbjUYIpoyQQQGR2HBB54r+w/wCB/wCz78Cv2cPC9x4L/Z/+DfhjwRpF3eG8utM8KaFBYQTXLIiNM6QIqtIUjRS5GSEUZwBXt8e8IZTwg6VGjVqTqVFdX5eVJOzvbW/4F1aUadtS78XPjJ8LPgJ4Cvvin8aPH2leF/DemeV/aWu63epbWtr5kqQoZJHIVd0kiIMnkuB3rxj/AIe9/wDBLj/o/wD+E3/hcWf/AMcr2/4l/C74bfGXwTffDf4ueANF8UeHtSVBqOheItLivbO6COsieZDMrI+10VxkHDKCOQDX8m//AAXC+APws/Zj/wCCp/xc+DXwV8LQaH4ZsNUsLrTtItBthtGvNMtLyWOJeiRiW4k2IMKi4UABRXLwJwxlfFmMqYPEVJwqJOSceXlaTSad1e92KlTjUdmf0sr/AMFe/wDglwxwP2//AIS/+FxZ/wDxyuz8X/t4fsa/D74YaB8a/Hf7THgvR/B/io48NeJ9S8Q28VjqZwTiCZn2yHCseD/Ca/nf/wCDX/8AZs+BX7Tf/BQ/XvC37QHwo0HxjpOi/CvUNVsdI8Sacl5ai7F/p1usrQyAo5WO4lA3A4LZHIBH9FnxH/Yu/ZI+LPws0/4JfEb9mfwNrPhLR1ZdE8O33hi2e00vKspa1j2YtWwzANFtYZODU8W8P5FwxnccAp1Z2s5v3Vo19nTfbfQKkIU5WOA/4e+f8EuP+j//AIS/+FzZf/HKVP8Agrz/AMEupGCJ+398JiScAf8ACc2X/wAcr+cb/gtd/wAEoPF//BMP9pSTTvD9pc33wv8AFs0154A111cmKPdmTTrgtn9/b7gobP72MxycMzolP/gh1+0l+yn+zj+3Vpdx+2d8JvC/ibwR4q059Cl1HxXpVtdweHbqWaJodR23KMqKpQxSOCpSKZ2yQpVvtH4Z5DieHnmuAr1a0eXmUVypvuttGtbrurGnsIOHMnc/rI0jV9M1/S7bW9FvorqzvLdJ7W5gcMksbqGV1YcEEEEEdQa87+PX7Z/7J/7LV9p2mftH/tD+EPA8+rxyyaVF4o16Cya7WMqJGjErDcFLrkjpuHrXoekwadZ6dBZ6XbRQW0MCJBBCoVI0CgKqgcAAYwBxivyY/wCDrz9qr9n34c/sx6X+zTf+APDev/E7x1Ir6TfX9hBPeeGtJiuI5J7uN2RnhM0kSwIAU3DzmDZh2n8r4dypZ5nVHBWlabs+W10urd01aK1ZhCPNOx9yD/gr5/wS4Jwv7f8A8JifQeOLP/45X0FoOu6P4o0Sz8SeHtThvbDULWO5sby2kDxzwuoZJFYcFWUggjqDX5S/8EHf+CEHwE+Fv7MNj8ev23fgH4d8YePfHdpFf2uheNdBhvrfw7prAPbwiC4VkF06kSSsyh03LEApSQydz/wWr/4LqeAf+CYeiQ/sz/s16LpWs/FS40qPyLAQj+zfCFmUAhknRMBpWUAxWoK4QCR9qGNJvXxnD2Cxmff2XkLnXkm05S5VF23attFd29em6KdNOfLA/QP4s/HD4N/AXwpL47+N/wAU/D3hDRIXVJdX8TazBY2yuxwqebM6ruJ4C5yT0r5D8e/8HIH/AAR38Barc6LL+1iNXubScxSroHhLVbuJmGclJ0tvJkX0ZXKnIwTX83d54n/bT/4KpftU6N4b8TeMvEHxH+InjHUhY6SupXTMkO9mkdY0AEVpax5kkKxqkUSB2woBr97v2Ev+DXn9g34EfD7TL79qnws/xV8dMizareahqNzb6VazYbMVrawvGJIgGC7rnzGcpvCx7ti/TZpwZwxwhh4f23iZ1K09VTpJLT1lfTzdr9EaSpU6a953PU/Bn/ByP/wR08Z6hBpSftWPplxczrDGus+DdWt4wW4BaU2pjjX1Z2AHUkDmvrr4PfH34JftCeFR45+BXxZ8OeMNGMpi/tTwzrUF9AHHVC8LsAw7qTkdwK/Pv9tv/g16/wCCfnx98CX91+zZ4YuPhN41Uedp+p6VqFzdabcyBQBDc2k8jhIiBjNv5TKTu+fBRvwGvLv9sr/gll+1fq3hjQ/GWvfDr4j+C9U+y38ukXrR+YFKSKGH3Lq2lXy5AkitHKjLlWBxVZVwZwrxfQn/AGLip060FdwqpP5pxtp5q++y0FGlTqL3Hqf2Vg5GaCQOpr8yf+CF/wDwXy0P/goVBD+zX+0lFp2gfGGwsjJZS2e2Gx8V28alpJrdCf3V0iAvLbgkFVaWIBA8cP6AftG/HDwh+zb8A/GP7QfjgSSaN4M8M3us6hHblfMlit4WkMaZOC7bdijuzAV+d5pkmZ5PmTwGJptVbpJd77NPqn3/AFMZQlGVma/xJ+Knw1+DnhC78f8AxY8e6N4a0OxUG81jXtUhs7WHPTfLMyouTxyRzXyH8S/+Div/AII9/DDW7rw3qH7Xlrq15ZttkHhrwxqmowPxnKXMFs1vIPdZCK/m4/b0/wCChX7S3/BRL4z3fxY+P/jq5ubdbqU+HvDVvOy6boUDlR5NtDnC/KiBpCPMk2AuSa/og/4Jzf8ABAb/AIJxfs1fBnQdW8ZfB3w18WPFmqaRbXOr+LfGNjHqdrcSugfNnazbreCEFiUZUMjLt3yPgY+9zXgnJuEMuo1s7qznVq3tClypK295ST2utl6J7m0qKpxTkbXgf/g5G/4I7eNr+20r/hqt9JuLqdYol1vwdqtvGpPQvKbYxRr6s7hR3Ir0X4vf8Fmf+Ccfwk0jwtq0f7TvhnxafGPiCHRtDtPAesW2szyXEjBdzpbSt5casVDO2AC6jqQK1vjH/wAEkf8Agmr8dPCdx4R8c/sTfDdYZ41j+2aJ4Xg0y9hUMD+6urNYp4unRXAPQ5BIr8Mf+CkX/BEPxH/wS8/a/wDhV8T/AIW69qPiT4TeJviLpVrpuoakga80W9+1RuLO6dFVJA6K7xSgLuEcisoKBpOHJMq4Hz7FexjVq0ZpNqM3CSlZXsppKz8mnfoTGNKb3sf0d/Er4rfDb4NeB734mfFrxzpfhrw9pkSyalret3qWtraozqgaSSQhUBZ1XJI5YCvGv+Hs/wDwTC4P/DwL4O89P+Li6d/8er2vxt4B8CfFPwld+CPiP4P0rxDoepRBL7SNasI7q0ukyGAkikDJIMgEZB5APav5sf8Ag6V/Z2+BH7N/7fHhTw38APhB4c8FaZqvwss9Qv8AS/C2jw2NrLdHUdQiM3kwqqBykcakgDOwZ55rzeCuH8t4nzRZfiJzhOSbTjytWir6p633ClTjUlZn7yH/AIKz/wDBMIf85BPg7/4cTTv/AI9XqvwX/aA+B/7RvhVvHXwC+LPh7xnoiXT2zav4Y1eG9thMgUtH5kLMu4BlJXORuFfx/f8ABO74d+Dfi3+3t8GPhj8RNBh1TQde+KOhWGs6ZcE+Xd20t/CkkT45KsrFSOOCea/sC+C/wE+CP7OvhA+AfgJ8JPDngzQ2u3um0jwvo8NjbNO4UPKY4VVS5CqC2MnaMnivQ484SyzhGrTw9GrOdSa5tVFRSu101uOtTjT0RZ+LPxi+FfwH8EXfxM+NHxD0bwr4dsGQX2ueINTis7S3LuEQPLKyqpZ2VQCeWYAda8g/4ezf8EwgcH/goJ8HQfT/AIWJp3/x6vaviB8OPh98V/C1x4H+KPgbSPEeiXhU3ej67p0d3az7WDLvilVkfDAMMg4IB6iv51P+Dqb9k39m39l/9pX4cXP7OvwZ0HwTH4m8JXU2t2PhmxWztJ5IrkIji3ixFG21iCUUFsDOcV5/BmRZVxJmccvxEpwnK7TjytWSvqnr0ZFOEZy5Wfu38O/+Cj/7AXxd8aaf8OPhX+2f8MfEfiDVZTFpmiaJ43sbq6unCliscUcpZyFVjgA8AntVTxx/wU6/4J4fDPxdqXgD4hftr/DDRdc0e8ktNW0jUvG1jDc2c8bFXiljaUMjhgQVIBFfKH/Btj+yx+zZB/wTB+FH7QY+Avg8+PNQm1ua78aP4et21WRk1i+t0/0sp5oCxRpGAGACjGOTnG/4OJ/+CZP7IHjL9g74kftXeHPgh4d8PfEjwuqa4vizQtNjtLjUne7hW5F6Ygv2svG7kPLudXwwP3gyjlPD64oeWVJ1VBT9nze63zc3Le38v4j5aftOXU+tP+HuX/BL3GT/AMFAPhEPr4/sP/jte4eAfiF4H+KnhDTviD8NvFuna7oWr2q3OlaxpF9Hc2t5C33ZI5Y2KupHQg1/EIYnCksCR/eGcV90/wDBGz/gtv8AGP8A4JifECLwb4sfUPFPwf1i9Da/4TEymXTWZjvvdP8AMIWOUdWiJWObBDFGKyJ+h594NzwuXSrZbWlUqR15JJe8uya69l120NpYay0Z/VXXMfGX4z/C79nv4a6p8YfjT41s/DvhjRIll1XWdQYiG2RnVFLYBPLMo4HU1T+AX7Qfwb/af+E+jfG/4D/EHT/EvhfX7QXGmarp8uVkXOGVlYBo5EYFHjcK6OrKyqwIHUa3o2keIdMl0fXtKt720nG2e1uoVkjkX0ZWBBH1r8QcPY1uWtFqztJbPTdarR+qOW1nqfLv/D8f/gkx/wBH0+B//A1//iK9r/Zw/at/Z4/a78GXXxD/AGa/ivpXjDRLLU30671PSJS8UV0sccjQkkD5gksbY9HFfzp/tb/A74Nv/wAHN9t8C4/hdoEPgu8+NHhS2u/ClvpUUWnzQTw6fJPE0CKEKSPJIzrjDl23Z3HP9JXwy+EXwp+CXhdfB3we+GugeFNIR96aX4c0iGxtgxAXd5cKqucKozjOAPSvs+LMhybIsHhJ4Z1HOvTjU95xtFPppFNvz0NKkIwSt1OjLBRkmsbx18R/APwv8M3PjT4k+M9K8P6PZJvvdW1rUYrW2t1/vPJKyqo9ya/MH/gt/wD8HEGkfsRa1qP7Kf7I9tY678Uoodmva9exibT/AAwXU4Ty8/6Rd4IbYf3ceV3iQ7oq/Dux1f8Abm/4K0ftUaF4B174g+I/iP498U6g1tpf9s6kzxWcbFpZSi/6u0tY18yRkjVURVOF4Ar0eG/DXMs4wX1/GVFh8Pa95K7a720SXm352aKhQlJXeiP6Yvil/wAF4v8Agkd8H75dO8V/tweE7yRx8reFo7nXY/xfTYp1X/gRFZXgb/g4S/4I7/EHxHB4X0P9tjR7e5uc+XNrnh3VdMtlxj79xeWkUMfX+JxXjv7CX/BsB+wN+zp4S0/WP2lPDT/FvxuMTX97rVxPDpFvLlv3dvYxuqyRhSoP2kylmUuBHkIv1B4n/wCCPn/BLjxZoVx4d1P9gP4UxW9zEY3k03wZa2dwoIxlJ7dElQ47qwI7GvJxMOAaFR06UsRUt9tezin5qLTbXq0S1STtqejS/tkfsrD4K6v+0bY/tA+EtQ8C6FZSXeq+KtH16C9soIox837yBnDNn5Qi5YsQoBJAOt+zv+0T8HP2r/g9o/x9+AHjNPEHhHXxMdI1dLOe3FwIppIJP3c6JIuJInX5lH3cjjBr8Hv+C6//AAbyeCv2OvhdffthfsSvqy+DNOmjXxj4J1G+e8bR4XcIl1azODLJAHKCRJWkdC3mbygIj/Tb/g3EJb/gjT8HSVI+TXOD/wBhy/qs14eyXDcNwzXA4mVXmqclnFRcfdbtJXfvaLVOzT0uOUIKnzRZ9wUUUV8UYhX4a/8AB5wfn/Z1H+x4s/no1fuVX4a/8HnH3/2df9zxZ/PRq+68NP8AktsJ6y/9IkbUP4qPyP8A2BfFHhzwR+3X8FfGfjHXrPStI0j4s+HL3VNU1G5SC3s7aLU7d5JpZHIWONEVmZmICgEkgCv6wYP+Con/AATT2c/8FCvgeCAMg/FfSBj/AMmK/km/ZI+E/hz48/tV/DP4G+ML29ttJ8Z/EDRtC1S40yREuYre7vobeR4mkR0WQLISpZWAIGQRxX75r/waB/8ABOZ8t/wvj4388n/ioNG/+VdfqHilhuGq+YYZ5niJ05KD5eSCkmr9btWOiuqbtzM+53/4Kj/8E0gML/wUK+B7H0HxX0j/AOSK/ml/4L4fFL4bfGr/AIKyfFj4m/CDx/oninw7qUui/wBn694d1WK9s7ny9D0+J/LmhZkfbIjocE4ZWB5Br9c2/wCDP7/gnLt/5Lt8bj7f2/o3/wAq6/FT/grD+yD8O/2DP2/fH/7KPwn13WtT8P8AhR9MGn3viKeGW8k+0aXaXb+Y0MUSHD3DAbUX5VGcnJPJ4Y4Xhajn85ZbialSp7N3UoKK5eaN3dN63t+JNBU1L3WfZP8AwaE/8pKfGn/ZFNS/9O2kV/SDX833/BoT/wApKfGn/ZFNS/8ATtpFf0g18V4s/wDJZ1P8EPyMsR/FPC/+Ci37C3wv/wCCif7K/iH9mn4nIludQiFz4e1xbVZZtF1OMN9nvIwSMlSxVlBUvFJJHuAc1/Ij+0H8BviZ+y58bfEv7P8A8Y9Ak03xN4T1eWw1S1kUhSyHKyoWA3xSIVkjfGHjdGHDCv7YiAeor8QP+DvP9inwPaeEvA/7fPh7ybPXZdbj8IeJIY7fB1KJ4Li4tJ2YEDfCLeaMkglkljGQIgK9Lwm4pq5Zm/8AZdZ3pVn7v92f+UkrPzsVh6jUuU6f/ggV/wAF1Phu37HHiT4IftofEqHTta+DHheTUNG1jUJFR9Z8PwKFSBMt+9u4GZIFjADyo8O0O6ytXzv/AMEzvgl8UP8AgvV/wVm8R/t7/tK+HZX+GvgzWob6XTLkeba5iJ/svQ03EKyoqCecqrKwRt6qboGvyL+UZLDIxyPWv65v+CKP7MHgv9lj/gmh8J/CPhCxVLjxB4Us/E3iK68pVku9S1CBLmV3YAF9gdIVJ5EcEY7V9Lxvgcu4Eo4nHYBWr4x8i7U42vUce3Np6X02LqpUrtdT2/8Aac+Neh/sw/s3+Of2hPEFr9osvBHhO/1qa1VwhuBbQPKIVJ4DOVCD3YV/Gh8Z/jB8Qf2gfiz4j+N3xW8QS6p4j8VavNqWs30vHmzyuWbavREGdqoMKihVUAACv6yf+C2fgnXviB/wSj+Onh7w2jNdR+A7m+Kp1aK1ZLqVQO+Y4XGO+a/kQwVyrggjrmtPBPCYVYPF4m37xyUfNRSv+Lb+4eFXutn7af8ABnz+yfo+ueI/ih+2b4m0VZptJEHhTwrdPhhBLIgub9gCPlfy/sahhg7ZJF5DGv3fUbRjNfkd/wAGeninRLz9hb4keC7e+jbUrD4tS313bBxvjguNLsI4nI7KzW04B7mM+lfrlX5h4jYiviOM8W6v2WorySSt/n8znru9ViMMjGa/Cv8A4PCv2UNI069+Fv7aXh/SVju76S48JeJ7lMATbFa6sCR3YAXqlupURjoor91Scc1+S/8AweBeKNFs/wBgH4f+D572MajqHxbt7u0gLYdoYNM1BJXA7gGeIH/fHrS8O8TXw3GWEdLrLlfmmnf/AD+QUG1VVj+fL4U/E/xt8FPiXoHxf+G2uy6Z4g8M6xb6no+oQgFoLiCRZI2wwIYblGVIIIyCCCRX9bt/Do3/AAVW/wCCVb29nPDpA+NPwk3RtuMqaXeXdpkBtuC4huDhhwT5ZHev5BEJVgcdDX9cX/BDbwLr3w4/4JOfAzw74lB+0z+CI9RUM2SIbyaS7hH4RToMdulfq3jPSpUMNgsbDStCbUX1tbm/CST+fmdOJskn1P5R/jf8Evib+zn8Wdf+B/xj8JXWh+JfDOotY6xp15HgxSgZBBGQ6MpDo6kq6MrqSrA19SfsD/8ABeb/AIKD/wDBP3Q7P4feBfiBaeLvBVnlbbwb45ge8trRCEG22mV0ntlVUIWNJPJUuzeUSST/AERf8FEP+CQv7Gf/AAUv0mKT48eB5bLxLZWwg0rxx4ckW11W1iBLCIyFWSeIEviOZHVfMcoFZi1fiX+2d/watft7/s/vd+Jf2dNU0j4veHYY98cWmMunaygCFm32c7mNwMbR5M8sjkjEYzgduV8fcIcX4COEzqMYz6qa91vvGXT5tNbXY4VqdRWmffv7G/8AwdjfsUfGe4g8L/tQ+Atb+E+rTOVGotIdX0hjwFBmgjWeMsc/eg2KOsnev02+G/xQ+F/xq8G2PxD+FPj3Q/FOgakrNp+t+H9UhvbS4CuyNsmiZkfa6upweCpB5Br+Kn4h/Df4ifCLxddeAfit4E1nwzrtgwW80bX9Mls7qAkZG+KVVdcg55HINd5+yR+23+0/+w18SYfij+zL8WtU8OX4lRtQs4J91lqka5xFdW7ZjuEwzY3glSdylWww8/PPB/LMbT+sZNW5Huot80H6S3XreRM8PBq8T+z1VCqFHav5yv8Ag8A/5SJeA/8AsjVn/wCnbU6/Yz/gkD/wUw8M/wDBUT9lG3+NdvoMWi+J9IvTpPjXQYJmeK0v0RX8yEv8xglR1dCckEuhZjGWP45/8HgBH/DxLwH/ANkas/8A07anXxXhlgsTlviDHC4iPLOEaia7Pl/q3dGdBONazPiD/glP/wApMfgD/wBlh8Of+nKCv7FE+6K/jp/4JUMq/wDBTL4A72xn4xeHMZP/AFEoK/sWT7or1PGr/kd4b/r2/wD0pjxXxIWv5/f+Dx0Z/aK+DI/6krUP/Sta/oCr+f3/AIPHQf8Ahon4NY/6ErUP/Sta+c8K/wDktsP6T/8ASJGeH/io/Rz/AINuP+UMXwa/3df/APT/AKjXXf8ABeFc/wDBIr46Nnp4O/8AbmCuR/4NuOf+CMXwb9l1/wD9P+o11v8AwXhJ/wCHRfx05/5k7/26gry6/wDyX8v+wr/3KL/l/wDM/HD/AIN+f+CaX7Pf/BTX9mb9oT4T/GbTjZapYXvh6bwj4vsIV+3aHdtFqILxk48yJ9qiWBjtkCr910jdPiT9v7/gn1+0R/wTk+OVz8E/j/4YMPmF5vD3iCyRjYa3ahsCe2kbrjK70OHjJAYDIJ/WT/gzSI/4Rj4/g/8AQR8Mf+galX6uftxfsMfs+f8ABQP4GX/wF/aH8IJf6bckzafqVuFS+0m7CkR3drKQTHKuT2KupKOrIzKf0zMOPsZwrx7iqFa88NJwvHrFuEbyj+sdn5PU3dZwqtPY/mE/4JSf8FePj/8A8Eu/iwdY8K3c2veAdYuFPi/wLdTnybwZANxbk5FvdKvAkAw4AVwwC7f6jP2Q/wBsT4C/tx/BDTPj5+zv41g1nQ9RGyeMOoudOuQAXtLqIEmGdNy5Q9QyspZGVj/K3/wU+/4JVftFf8EvvjE/gf4p2qax4W1Gd28I+OdOtmjstXgHIUhixt7lVI8y3ZmKnlWkQrI2R/wTc/4KWftB/wDBMn43p8WvgtqBvtKv/Kh8W+Dby6aOx161UnCSbc+XKm5zFOAWjZiMMjvG/ucW8F5XxvgFmuUSj7Zq6a0VRdpdpLZN63VpeVVKUaseaJ9k/tZDH/B2Jpv/AGXLwb/6TaZX7of8FKf2qT+xZ+wv8S/2lLWKGTUPDPhqR9EjuY98TajM6W9mJFyMp9omh3c/dzX88Wk/tT+A/wBtn/g4q+H/AO1J8MtN1Cz0Xxf8YfB9zaWeqRqlxbskenwyxOFJXKyxuuQSDtBBwa/bH/g408P6z4k/4I4/GKx0O1lmlhtNGu5UhGT5MGtWE0rH2WNHY+gWvieL8Av7YyLB4uNv3dKE0+nvJSX6GVVXlFM/lY8TeJPEHjPxLqHjHxbrNzqWq6teS3mpahezGSa6nkcvJK7MSWZmYsSeSSa/cr/gz3/ZP0EeFvid+2zrVlBPqMuqReD/AA/I0eZLOKOKK7vCD0/emazHqBAezGvwoI2sVPUHmv6Qv+DRLVrG8/4JseKtMt1VZ7T4waiJ1B5O7TtNZWP1HH/Aa/SfFavWwnBcoUdFKUIu38t729NEvQ6MRpS0P1SooJwCcV8cf8FBf+Cmv7RX7DviHWL/AMP/APBNjx38RvA2h6Mmo6j498Pa/bpbQII2kn3wCOSVEiVSXkICgZOcAmv5fwWBxOY11RoJOT2TlGP4yaV/Lc4IxcnZH1R8U/hl4K+NHw4134R/ErQotU8O+JtJuNM13TJndVu7SeJopYiyFWXcjEblIYZyCDg1jfs5fs5fB79k34O6R8AvgH4SGg+E9B8/+ytJW9nuRB508k8v7y4kkkbdLLI3zMcbsDAAA/I4/wDB5T8Jc4/4YU8Sf+FzB/8AIte9/sOf8HBnxJ/bz+Iug+HPhL/wS/8AiW/hbUvE0Gkaz4/tNRN3peiM5TzJJ5UtAg8tJFdk3ghWUnAINfS4zgzjDLcFKWJoOFJO7vOPLdJ625rXtdLr0LdKqlqj9LqKB0GaK+PMgr8Nf+Dzj7/7Ov8AueLP56NX7XfEzWvGHhv4da94g+HnhFPEGv2OjXVxoegyXyWq6leJEzQ2xmf5YRJIFTzG4Xdk8Cvws/4K6fsp/wDBev8A4K0+IfB1z4t/4Jl6Z4N0rwNHfjR7LTfidod3PM94bfzWmme/VSALaLaFjXGXyWyMfeeHPscPxPRxlerCnTpt3c5xjvGSVk2m9X02NqC/eJs/MP8A4Juf8pEfgL/2Wfwv/wCna2r+yiHhR9BX8uXwX/4ILf8ABcP4F/GLwl8b/CX7EUNxq3g3xNYa7pkF/wCO9AeCS4tLiO4jWRV1JWZC8ahgGUkZAI61/RJ+wn8Wf2w/jH8IbrxB+21+ytZ/CTxdaa09rDoNh4utdYivbUQwut4slszLDukeWPymZmHk7s4YV9T4uYnAZriMNisHiKdSMIuL5Zxcrt3Xup3t5rbqaYhxlZpntlfymf8AByBx/wAFnfjMP+mug/8AqP6bX9NX7WXjz9oD4a/AbX/GX7L3wTt/iJ46tEgGg+D7rXIdNj1BnuI45N1xOypHsiaSXBI3eXtBywr+ej9t7/gj9/wXi/bx/am8WftXfFD9hCw0zWvFk1s91YaL460JLaBbe0gtIlTzdTdz+7gTJLHLFjgA4HD4S18Hl2c1cbi69OnDkcPenGLbbi9E2nay32voLD2i7tm//wAGhJH/AA8q8aDP/NFNS/8ATtpFf0g1/Ob/AMEzP+Can/Be7/gmN+0uP2jPhr/wT+sdfa50OfRtZ0XVfiJoMaXljNJDKyJImoExOJLeJlfawG3BVgcV+/8A8APGHxU+IHwh0Hxj8bfhKvgTxXf2Il1zwgutxakNKnJOYftUQCTYGDuUAc1w+KNTDYziJ47DVqdSnOMV7s4yaaWt0ndetrfMmvaUro7Ovyw/4O7AP+HZ3hf/ALLLpn/pt1Sv1MuHaKFpEjLEdFAr8af+C1fwk/4Lff8ABSzwxcfsx+EP+Ca+kab4D8O/ECXVNF8TQfErR5bvWY7cXNtaz7Jr2L7OkkM7SNEyF1JVcjad3hcEQguJcNialSEIUpqUnOcY6eV2r/K5NGyqJs/AQfeAr+zn9gT/AJMV+DH/AGSnw9/6bbev5pR/wbhf8FogwP8AwxbKMdx4/wDD3H/lQr90P+CSnxE/4Ko6NoPh79mv9ur9hDRvh54Y8GeAYNP0rx1p3jmwvW1G5tTb21vbtZ29zO6O8G+RpM7A0JHy71Wv1Dxax+WZ1l1CeCxNKp7NyckqkG7NK1le7+V2b4hqaXKfbWu6PpfiHR7nQtb06G7s723eC7tbiMPHNG6lWRlPBBUkEHqDX8k//BYb/gmX4+/4Jl/tWah4AvdNvbnwJ4juZr74c+IZkZkurHdk2ryY2m5t9yRyLkEgpJtVZVr+uOvOf2o/2UPgJ+2Z8I9Q+B/7Rvw7s/Enh3UCHe2usrJBKAQs0EqESQSqGOJEZWAJGcMQfzbgnjDEcI5k6tualOynHr5SXmvx1RjRq+zZ/N//AMG4H/BSPwr+wb+2XceBvi74gg0zwH8U7aDSdX1O8lEdvpmoROxsbuViDsj3STQuxwqC58xiFjNf1BwTxXMYlhkV1PRlOQa/nv8A24v+DSP9of4eX174t/YV+KFj4+0QAvb+FPFV5Hp+sxjICxJOQtrc4HJd2tsAYCseTQ/Zm/ak/wCDlv8A4Jn+Ho/2f3/Y28a/EDQNEgW10fTfEnw+v/EVvp0Sn5Y7bUNLk3NGBhVQzSRoqhUCgYr7ri7K8i44xEc0ybF01VaSnCclBuysn71tbaPppozSrFVXzRaP6IJnCRlycADk1/MP/wAHKH/BSHwt+3J+2NZfDH4PeJbfV/APwptbnTdN1SzkWS31LU52Q31zDIv+siHlQQo2Sp8hnQlZAT6/+0l+1X/wcxf8FJvDc3wBt/2M/GPw90HWLZ7fWbDw94Bv/DsWpQtgmO4v9VkyqFQVZEljV1ZlcMDirn7EP/BpB+0N4+1Kw8W/t1fFOw8C6JhJLrwr4TuUv9Yl5YNE9wAbW1ONpDobnqRgdaXCWUZHwTiXmuc4um6sU1CEJc7V937t9baLor6vsU4Rpe9NnxT/AMEgP+CYPxC/4KbftTaZ4Di0m+tvh9od3DefEXxHFEwjtbINn7KkgIAuLjaY4wMlQWl2lYmr+lb/AIKW/E3xt+yP/wAE1/iZ8Uf2ftSh8Na14J8EtJ4XntrCCWPTzEY0jCwyo8RVV4CspUDHHFelfsv/ALKfwF/Y3+Elj8Ef2dPh1Y+GvDtixkFpaAs88xADTTSuS88rBVBkkZmIUDOAAPPP+Csvwj+I3x6/4Jy/F34OfCPwtNrfiXxF4Rls9G0qCaON7mZnQhA0jKo6HqRXynEfF74w4kw860eTDwnFKMuzkuZy6XfXolp3IlV9pUXY82/4Ii/8FQNE/wCCkn7IGl674o8RW8vxM8J2sWnfEWx2xxySXSjamoCOMKqx3KqZBtVUEgljUYjr7QZFcYYV/PT+zr/wbb/8Fff2etB8KftPfs1/tJeFfBHxDl077TqXh1taurW704swcWTyxwS293kBRLHJiHcGXMijefo2L/gon/wcx/swaRbaP8e/+CZOj/EdIY/KXWfCenPeXl2yjHmyjSbueNC3XAgi/wB0VpnnCmVYzM6k8ixlKdNt+5KahKPdLmspR7O+wSpxk7xaP01/ar/Ys/Zc/bP+H83w8/aZ+C2h+LNPMTpbSahagXNkWwC9tcpia2fgfPE6txjOMg/x6/tK/Djwv8HP2jfiB8JfA3iF9X0Twr431XSNG1aSVHa9tba8lginLIApLpGrZUAHdxxX7B/Gn9vb/g5o/bs8M6l8E/hJ/wAE/PEHwsttViaC41Kx8I3mjX3kMjK8Y1HV5o4osgn54hHIONrisv8AYN/4NH/idrmt6d48/b/+K9homkIYp5PA/gy6Nzf3OVJaG4vGURWxVtoPkifeC22RDhq+04KxWH4Cwlepm2NhaSXLShNVHfulG6TfrbuzSk/ZL3me4f8ABn98CPFfg39lH4lfH3WbS7ttO8ceL7az0OO4hZEuIdOikSW5jJGHUzXMsRYfxWzKeVNfPP8AweI/B/xHp37S3wn+PjWztpOseCrnQFlVDtjuLO8e4KsexZL4EeuxvQ4/eX4VfC7wJ8Ffh5o3wp+GHhi10Xw94f02Gw0fSrJNsVtBGu1UXueOpJJJySSSTXmn7e/7B3wM/wCCiX7Puofs9/HnSpnsJplu9J1SxZFu9JvkBEd1bu6sFcBmU5BDI7qRhjXw2A41jS48/t2tBqEpNNLdQa5V80rN97GUaqVbnP5M/wBgD4heGPhL+3Z8Gfih411KGy0fw98U9A1DVry4bbHb20WowPLKx7BUDMfpX9mttJ5sKyZByM5HSv5q/wBpz/g1L/4KN/B7XZZP2eL7wx8VdHNzt099P1eHSNR8vAO+a3vnSFMHIwlxKcc+1e7/ALK/7ZX/AAcp/sCeCtO+BnxG/wCCfniH4paFodutvp02peHbi/voLVE2xwJqGnSukirjgyrK+DjdgAD7nj/D5ZxtGhjcqxlKU4JxcJTUHZu6+K1mtbp2NqyjVScWfu+xIGRX853/AAd4fFvw94x/bw8C/CzQ9Yt7m48JfDpX1WG3lVza3N3dzOIZMH5H8mOGQKedsyHGGBP1Z4m/4KZ/8HIX7Qunz+Ev2d/+CUUXw/uLi3kQaz4ps5Ent3K8SQtqU9rAHXkgSRygkDK8GvN/2J/+DYj9ov40/HFP2o/+CsfxUtryW91IanrPg7TtUa+1HWbgsWaO+vFxFChO3IgaUshKq8RwR87whg8HwdmTzXNcTTThGXLThONScm1b7DaS9WRTiqT5pM/Qn/ggP8MfE3wk/wCCQ/wS8LeK7Tybu68PXOsLGWziDUL+5voD7ZhuIzjsTV3/AILwAf8ADon468f8yd/7cw19X6dpljoulwaTpVpHb21rCkVtbwoFSKNQAqKBwAAAAB0r8yP+Cq3gn/guh+2F4R+I37I/wb/ZX+Fdv8LvEFy+n23iS58WodWvrBJ0ljlCyXCx27PsG5TExAJwQcEfH5VV/tTimOMqzhTTqqpJzkopLn5mlfd+SM4+9UufP/8AwZpEHwz8f/8AsI+GP/QNSr9wK/Fj/gif+wP/AMFkf+CVnxD1vRNU/ZX8D674P8f6ppCeKryX4gWyXelQW0sytcQCN2EpWK5lbyiuWKqAy85/aWFmaMEiu7xBrYbF8VV8Vh6kalOpytOMlLaMU7221XUK1nO6OB/aY/Ze+Bn7X/wh1T4F/tDfD6x8SeGtWQfaLK8TDRSLnZPDIuGhmQklZEIZT0Nfy9f8Fev+CM3xt/4Jb/EkX6/bPE/wu1y9MfhTxsluCY2ILCxvtgCw3SqCQQAk6qXTBEkUX9Ytc18Yfg/8M/j78NdX+D/xi8F2HiHw1r1m1rq2kalCHinjP6qwOGV1IZGVWUhgCJ4O41zHhHF3h79GT9+HfzXaXn12YUqrps/kR/4JOn/jZz8Af+yu6B/6XRV/Xd8Yfhf4P+Nvwo8R/B74gaV9u0LxTodzpOsWm/b51rcRNFKueoJRzgjkda/FTRv+Daz9ob9k3/gqr8MfjZ+zJc2fif4PaJ8QNL164udV1qGHUtEtoL1JJbeVHK/atqjKSR5LDhlUjLfuepDKGHcV7vibxBlue5lhMXl9XmSp/OL5m7NdGiq01Jpo/jS/b8/Yk+LX/BPn9qHxH+zX8W9LuFl0yczaFrEkBSHW9NdmEF7CeQUcKQQCdkiSRk7kYV9q/wDBsJ/wUf8AC37IP7Vmq/s6fF/xJHpvg/4tfZbez1C7mC2+n61CXFszkkBEnWR4WbB+fyN2FUkfvD+3v/wTh/ZW/wCCkHwuj+GP7S/gP7a1i0kmgeItPkEGqaLNIoV5LafadobC7o2DROUTejbVx+I/7XX/AAaTftmfC68vdd/ZM+Jfhz4l6MgL2ek6lONI1jlziPbKTaybU25kM0W45wi8CvtsFx3w7xhw9LK87n7GrJJOT+FtbST6O6vZ27XaZqqsKlPlk7H9F0cgkGRXmn7ZcGlXH7JXxTg1qVEtJPh1raXTyY2iI2EwYkngDBPJ4r8Uv2ef2tv+Dm7/AIJ0eEbP4G+LP2JPEnxP0XSIkg0lNZ8JXXiCWytwPliivtHnJeMDgea0uwBVXaFCh37WH7Z3/Bxn/wAFJfhvqX7Mvhj/AIJ0eJvhz4f8SwfY/EBtvBN/pkuoWzKQ9tLfaq6RRwOOHChCR8rOVZlP5zQ4DxlHMIN4ug6Kkn7T2sLcqe/Lfmv5W369TJUWpLVWPxj3bznGOcdMV/TP/wAGpdpbj/glTBcCFQ0nxF1lmIUdcQL/ACAFfnX+y9/waX/t5/Faa11P9o74h+E/hdpkm/7VZi5/trVIsfdAhtmFsQT3+08DnB6V+5//AATw/YM+F3/BOD9muy/Zo+EniPWtX0221K41CfUdemiaee5nKmRsRRoiJlRtQDgdSxyx+78UuLeHs1yWOAwdZVKimm+XWNlf7Wz3WzZriKkXHlTPcgMDAooor8EOMCM96a0asckU6ilZAN8paVVC9KWihJIBGUN1pBEg6U6kLBRljj60Wj2ATyk9KdgUAhhkHNIGB6GkuVALSeWuc0iyRucI4OOuDSsyr95gPqabswDYPU0bF/KgSIQSHGAMnnpQGViQCDjrilaIC0UUgdScbhmndXsAp5pojUDHNOoosgEKgjB5oChelLSMyr944oslqAtBAPWkV1fkEfnQXRTgsM+maLqwAFAGKNozknP1oLKBksB9TQGDdDStEAKAnJJpQAOlJvX+9SCWMtsEi7v7ueaLxuA6g8jFIWVTgsAcdzQrBuhH51QBjjGaAoAx/OgsAcE0pIHU0lZ7AIyhhg0oAHSkV0cZVgfoaUkDk0K1rgBGRimmNW69qRZ42O3cPzp/XpRowECAdKWkLqGClhk9s0BlYZUgj1FCSQC0UjSIpwzgE9ATS0XQBgZzRSF0U4ZgCfU01Jo5OEdT9DRdXAfSFQeppaKdgECAHNKQD1FFFKyAQKAciloop7AFFFFABRRRQAUUUUAFfNv/AAVx0H9obVf+CfnxE1v9lX4ka34X8eeHNJOuaHe6DIRPcC0Pnz2uApL+bAsqKoHLlPTFfSVRXcMU8DRTIGVgQVYZBBGCPyrowmJ+p4unX5U+SSdmrp2d7Ndn1GnZo+YP+CSH7ZsX7Xv/AATX+HP7Q/jDxCJtXi8Omw8ZXt1cRmQajY7oLmebYcIZfK+0YOMJMpwM15L/AMEK/jn+0j+2Z4d+Lv7cPxg+IviS68F+OfiPeW3wi8LawYxBpOiWkkih4VjAGWeTyGJyd1iTk7iW/OTxL8W/H3/BMrTv2xP+CNHw+0Z5dV+JvjXT7P4D6RFbSv8AabbXylrcRibIJcafJaRq3AE0cnU7hX7k/sd/s0+Ev2Pf2XfA37MvgeOM2Hg3w7baeblIRH9suFQG4umUE4eadpZm/wBqRq+x4hwOEyfC4idOKaxMk6Wm1KyqNrtrKMb/AN2SNp8sU/M+Mfgv+0z+0Prf/ByV8WP2WdY+LOrz/DrRfhDb6rpPhKScfY7a6aHRszKm3IYtPMeT/wAtGrvf+DhP47fGv9m7/gmb4m+MHwC+Jeq+EvEOmeINISHWtHlCTRxS3iROoJByCHGRjmvCPgPdxf8AEWT8aVDfe+BVpHhuPm8jQm79eATXpX/B0HdCH/gkB4ztcAtceJdCjUY541CJv/Za2+rYf/WbKoci5ZU6DasrNu17rZ363+YWTnFehr/8Ejf21fjldeMfGf8AwTW/b212W5+N/wALJTPaeILgAJ4z8PSMDb6nC/BkZQ6K/wAoYI8RbdIJtrf+CWnx4+PvxJ/4KO/tqfCX4t/FTVdd0DwH410OHwXpN/KDFpFtc/2nI0cIAG1SqQjvxGvpR/wVj/Yp+JvxV8A+B/8Agod+xtD9m+PnwTs01fw0YIHLeI9L2b7rR5hEyvKrxtLsjBO4ySxDb9oZx43/AMG837Tnhb9sb9sz9sP9pjwdpc+n2PjC48DagdOujmS0uGsNQS4hLYG8JNHIofA3BQ2OamphsHi8nx2Z0IRScIqUUl+7qe1p35V0jNXcbbe9HZBZOLaPtb/gqn+2NF+wp+wf8QP2iLK6VNbsNJNl4SiIVmm1e6PkWgCN/rAsriVlGTsic44r4m/4JhftEftxfst/8FLV/YA/4KGfHrWPGN38TPg5pHinwbNrtysj2OqpbtJf2MRQbcb01FSc5ZbGJuN9P/4Kvw/Ej/gpV/wVI+Ff/BLj4GfFiDwzafDLTn+JXj3X30a31SPTr+JVGnLJZzlUnZDJFmNm2MmqAsrBMHyH/gsv+yT/AMFAf2OdL+Gv/BUn4l/tvj4z6x8F/HFg1vAfhdp3hxrKynnBk82ewcvPBJNHBA0TghVupCpG9w3VkmXZf/Z9PL68oKri4ya5k+ZN/wADlfK0ryi27yV1JabBGMVGz6n7d0VzPwb+K3hL45/Cnw18ZfAGofa9D8V6Fa6tpFyV2mS2uIVljYg/dO1hkHkHINdNX5zKMoScZKzWjMGrHOfGD4n+E/gl8KPEvxl8eXzW2h+E9Bu9Y1i4SMu0drbQtNKwUcsQiNgDqeK/Mf8AYutf+Cjn/BbzwzqP7XfxN/bE8XfAX4N6jrN1afD/AMCfCOaC21S8ghlaJ7mbU2Rn4kRojlSHeORlSFQu/wDRn9rT4Kf8NJfsu/ET9nwayumt438FanoceoNEZBavdW0kKy7QRu2lw2M84xX5lf8ABFb/AIKTfB7/AIJ+/BKH/gl7/wAFG7qT4N/EP4d6tfRaXN4xge30/WbG5vLi5W4juyPJUB5JVDlhFIixvHI+5gv12R0ZPJMTWwcFPExlFW5VOUabUuaUYtO75rJuzaXY1h8La3Pub9j/APYY+L/7JnxC1HVdT/b7+K3xR8JXujfZ4fDfxTu7fUrm1vRMji6S+SOOTb5YePyiu079xPAFfM//AAXV/ar+O/7NX7T37H+m/C743aj4P8O+L/iy2n+Oora9WG3v7EXukgrcMwx5axyTgnIG2Rs+31j8B/8Agpd+xN+1H8cr/wDZ2/Zz+PujeNvEmlaDLrGpjw4ZLmzt7RJoIS32tFMDtvuIxsR2brkDFfB//ByJpHhfxT+1X+w/4L8b6LZ6nouq/GaS31jTtRiWSC6tZL7RY5YpI3BV0ZZGUg8EEg9avh6lXxHFVKOYw1cZ3TgloqU7Plsl0uvPUcLup7x9+fHf9q74B2PwO8X6h4U/aT8Gw6lF4Wv5NKmtPF1l5qXAtpDEyfvPvBwpHuBXgH/But8ffjd+0x/wTV0b4uftBfE3VPFniO98V6vDLq2rzB5fJin2JHkAfKADj612nx9/4Jdf8E1PC/wI8Z+J9K/YQ+Elrc2HhPUbm3uYPh5pweJ47WR1ZT5OVYFQQRgggV4p/wAGrWqQ3v8AwSa0iyQgPZeONbhlUdmMqyY/KQH8az9hlj4SxFTDqTkqtJXlGKaTU9FZvTvt0FaPs3Y4n/gon8VP2m/Gf/Bdz4TfsPeCv2yvG/wv+H/i/wCEkmq623hHULeB47qFtakEqm4ikQM5tLeM5ByOmDgj6q/Zn/Yr8ZfCn436X8Q9R/4Kj/GH4lW2nQ3Bk8GeKdf024sbsPC0QaVLe3jY7DIHXBGHVM9MH4B/4K3aL+x74o/4OJPg5pH7c8/h1Phq/wADX/4SB/FOpm0sgwn142/mSK6Ff34jx8wyxUex+tP2BtE/4IF/Cr9pe0h/4J++LfhpF8SfEOk3WmWtr4V8V3N7PdWoUXU8SxtPJHgC2Dk4BAjxnnFermdKdLIcL7GE1egm+WjCUW+aV3Kp8SdrX0utCpL92rdjV/4OA/j78Yv2ff2HtJ1r4DfFLVfB3ibxB8TdD0Ky13RWCzwpcPIZANwIIKRnjv61T/4IM/ta/GX46/s1+NPgv+1T4quNU+K3wZ+I2qeFvGl5qF+k9zdbZ3kindl42gmW3U9CLTOTXL/8HEtxba14I/Zk+GchJfxB+1X4WQoP4olFwjcfWVK+ef8AgoZ+0HrX/BGT/gp98Vvjp4T0+9j0f9pb4LTzeGoLHT1eGLxxY7YLZmTI3KGZJJCOS1+Tg5zSy3LqWZ8MU8BCEfb1XOcJWXM3CUIuN97crk7XtoEYqVOy3OY/ad/4KR/tmeOP+Cqfh7xh8IPj/r2hfBSH9p/QPhZY+HrGWNbXWXs5rb+2XkxkurSTBVYHDRyqO1ftD8T31Nfhhr0uh38lrepot21ncxHDRSiF9jg9iGwQfUV+KX/BQL9mW1/4J1/sG/sJeE/ESKmu+FvjZpms+MJXmDtLq1yRf32ZB/rAsqtGrddkaegr9r/iHNFD8N9cnkcBF0a6JbsAIn5rm4ojgJYXATwsUorngml8ShNRUpd3LfXuKpy2jY+Iv+Db/wDaK+PP7UH/AATvf4q/tFfFPVvF/iCXx5qdsuq6zPvmW3jjtwkWQAAoJYgerGuU/bY/bg/bM/ac/wCCk9v/AMEkP+Cefj6w+H9xoXh5db+LnxVu9KjvrrSLZ44pBBa282EJ2XNr84y7SXShWhEMjtS/4NPb6O8/4JaSwRMC9t8S9Xikw2cExWr/AMnFed/tPan4k/4JG/8ABdLV/wDgpR8ZPA2q6j8EPjR4Oh8P+IPGWj6dJcL4XvNtjEPPWNWY/vLCFwOC8dzJ5YkeAoe6WDwj4zzGnTpxc4Ko6MGlyuaaslHZtLmcY7NpKz2Ksvaux9KaZ/wSE+P3hGW38XeBv+Cxn7Sx8SxzRSzS+JvENrqukTEMC6/2dLAqBGG4Bd/y5HXGD9whzBCWcltq/ia+UfFX/Bcv/glL4R8C2vjuX9tXwdqMN4kf2TTNDuJL7UnL42K1lAjXETEkD94i4J5IroP+CsP7atj+wf8AsEePP2hor5Itah0htP8ACEbAEy6vdfubXCN98I7ecy/3IX9K+UxWHz3HYqjQxVNxnN8sbwULttJ7RV0vwM5c8nZn5uf8FD/26f8Agof48+Ivx9/bR/Y6+Per6D8Jv2ZvG2geGl8OWYU2nii4iuMas8oGS4iuJYUbkI1uwPrX7D/AT4w+D/2gvgp4T+OXw9uXl0Pxh4bs9Z0p5V2v5FzCkyBh/C4DgMOxBFfmB+yN/wAERv29NH/4J/2/wBH/AAUvbwT4Z+JPhmW+8deAn+COk38q3OqWym9hnv5pftEswDeUZsqw8tdu3auOw/4NmPjx4m0r4HfEX/gnL8XruJfGX7Pvji+0ryI2JDWEt1NnaScyBLxLsbsABHh7EZ+mz7CZXisnnLAyhL6rJR91NN05JR5pXjHmfPG97y+Pfvc4x5NOhuXH7R/7Rbf8HKC/sur8YtaHw6Hwl/tlvB/nD7F9o+zFfM2YyW3/ADZz1r9IJCQOPWvyA+N37SPwH/Zk/wCDoHUPil+0H8UdH8JeH7f4Fw2Mmr61deVClzIqskefVhnAr9G/2cf+Cg/7GP7X3irU/BH7NH7Qvh7xnqmj2IvNTtNFneQwQFwgkJKhcFiBwa8riPLsQsNhK9Ki+T2FNuSi+W+t22la+123cmotmuyPz0/bQ/bC+K/xd/4LE63/AME+fjx+3jrX7M/wi0LwhZ6joGt+Hbu30i+8W3ksMEmE1W4Qi3HmTTxjBKMbMxhTIxYfbH7GX7FPxS/Zm+IUvisf8FEPil8WPA2o+HnhtPDfxNvbXVZY7x5YpI76LUY445CoiSRBFtKN527PyqK8+/bQ+PP/AARP/aP+I3iT9jb9vTxr8Mz4i8FrCNRsfH039lT6eLm3huFay1GXySrNHLFuNtMH7N0r47/4I0XVh8Pf+CwnxG+Av/BNr4reJPGP7Kmn+G5rrWRqF5cXmjaPqzeWUisLhwFZxLujRslpoVlJMwhWWvSlh55hkTdODoeypJyUqceSaVvejUspc873Sd77KVtCvipn7PUUDpRXwBgFFFFABRRRQAUUUUAFFFFABRRRQAUYB6iiigDGv/h14A1TxBF4t1LwTpFxqsCqINSm02JriMKcqFkK7lwSSMHg1s4HpRRRzzlo3ewGbb+DfCdr4hl8XW/hqwTVZ4xHPqa2cYuJEAACtIBuIwAME9h6VLrvhvw94o09tJ8S6FZ6jasys1tfWySxllOQSrAjIPIPY0UVXPPmTvqtguy2Io1QRqgCgYAA6Cs7QfBnhDwq9xL4Y8LadpzXbBrprCxjhMxBJBbYBuOWPX1PrRRSUpJNJ7gSWnhbwzYatca9ZeHrGK+uv+Pq8jtEWWb7v3nAy33V6n+EegqTWtA0PxJpsmjeINHtb60lK+ba3lussb4YMMqwIOCAeR1ANFFPmldO+qAk0zS9N0axj0zSLCG1toV2w29vEESNfRVUAAewqeiioTb1YAQDwRXOfEb4Q/Cz4v6Ovh74q/DbQPEuno5dbHX9HgvIQx77JkYZ98UUVSnOm+aLs11QEngD4VfDL4VaKPDnwy+Hmh+HdPVgy2GhaTDaQhvUJEqrn3xVzWvBnhHxHe22o+IPC+n31xZMWs57yyjleAkqSULAlDlVPGPuj0ooqvaVHLnbd+/Ud2Xrmwsr21eyvLWOWGRCjxSIGVlIIIIPBBBIx71V8PeFfDPhGwGleFfD1jptqGLC2sLVIYwx6nagAycDP0ooqbtR5egih4k+F3w18ZagmreL/h/omq3UcQjjuNS0qGeRUBJChnUkAFmOOmWPrRonws+GfhrUU1jw78PdDsLuJSI7mz0mGKRQQQQGVQRkEj8aKKftqyjy8zt2u7Duy/rPhnw1r89pc694fsr2SwnE9jJd2iSNbyjo6Fgdje4wah1rwd4Q8SzW9x4i8MaffyWjlrWS9so5TCSQSVLg7TkA8eg9KKKSnNNNN6baiux2v+DvCPiiGCDxP4X0/UY7aTzLZL6yjmET4I3KHB2nBIyPWr8lvbzwmCWFWRgQyMuQRjBBoopXeivsBT8OeFPC/g/TzpXhLw5YaXaly/2bTrNII9xABO1ABnAHPtVy5tLW9ge1vLaOWKRSrxyIGVgeoIPUUUU3KTlzN6gcN4L/AGYP2bfh14lbxh8P/wBn/wAFaFqzlvM1TRvC1pa3D7vvZkjjVjnvzzXY6v4e0HX7dLTXdFtL2KKQSRx3dusiq4BAYBgcHBIz15NFFU69apLmlJtrZtsbbe5bEaAbQgAAwMCs7TvBvhLR9WuNe0nwxp9rfXeftV5b2UaSzZOTvcDc3PqaKKlSkk0nuIp658LPhl4n1U654k+Heh6helQpu77SIZZSoGAN7qTjAHGam8N+AfAfhG4luvCfgvStMlnXbNJp+nRQtIPRiijP40UU/a1XHlcnbtd2+4LsyfiX8BPgh8ZY4IPi78HvC/imK1/49o/EXh+2vVi/3RMjbfwxW14S8GeDvAWh23hbwP4V07R9Os4/LtLDS7GO3ghXrtRIwFUewFFFJ1arhyOT5V0u7fdsO7NSiiikIKKKKACiiigAooooA//Z';
/* ============================================================
   LÝ DO IN TRÊN ĐƠN
   Người ký cuối là Trưởng Bộ Phận người Hàn, nên MỌI lý do do phần mềm
   tự điền đều viết bằng TIẾNG ANH. Nếu nhân viên có tự ghi lý do thì
   lấy đúng chữ của nhân viên, thay cho lý do mặc định.
   ============================================================ */
const REASON_EN={
  leave :'Personal matter',
  change:'Personal matter',
  late  :'Personal matter',
  swap  :'Personal matter',
  ot    :'Operational requirement',
  multi :'Operational requirement'
};
/* Lý do cuối cùng in ra: chữ của nhân viên → nếu trống thì mặc định tiếng Anh */
function printReason(r,fallback){
  const own=(r.note||'').trim();
  return own || fallback || REASON_EN[r.type] || '';
}
/* Người nhận ca trong đơn đổi ca: luôn ghi "Cover for <tên người nhờ>" */
function coverReason(forName){return 'Cover for '+shortName(forName||'');}

/* In NGUYÊN mã ca của phần mềm (AL8 / AL4 / NP / OFF…) — không quy đổi,
   để nhân sự đối chiếu đúng với lịch ca trong app. */
const FORM_OF_TYPE={leave:'leave',ot:'ot',swap:'shift',change:'shift',wt:'wt',late:'late',multi:'multi'};
function reqFormType(r){return FORM_OF_TYPE[r.type]||'leave';}
function numDaysInc(f,t){return Math.round((new Date(t+'T00:00:00')-new Date(f+'T00:00:00'))/86400000)+1;}
/* Bộ phận in trên đơn: lấy theo cài đặt (biểu mẫu công ty ghi "LPG Terminal" cho mọi người);
   chưa khai thì mới rơi về tên nhóm. */
function deptOf(empId){
  const d=(S.settings.deptDefault||DEPT_DEFAULT_FALLBACK||'').trim();
  if(d)return d;
  const e=empById(empId);return (e&&e.team)?('Nhóm '+e.team):'';
}
function chunk10(arr){const out=[];for(let i=0;i<arr.length;i+=10)out.push(arr.slice(i,i+10));return out;}
/* Quy định công ty: MỖI NGÀY LÀ MỘT DÒNG trên biểu mẫu.
   Các hàm build dưới đây duyệt reqDays(r) — đơn 3 ngày sinh 3 dòng. */
function buildLeaveRows(reqs){
  const rows=[];
  reqs.forEach(r=>{
    const e=empById(r.empId);
    reqDays(r).forEach(d=>{
      const code=d.code||r.code||'';
      const h=getHours(code);
      const hrs=(h>0&&h<=4)?['08:00','12:00']:['08:00','17:00'];
      rows.push({name:e?e.name:r.empId,id:r.empId,dept:deptOf(r.empId),
        fromTime:hrs[0],fromDate:fmtVNfull(d.iso),toTime:hrs[1],toDate:fmtVNfull(d.iso),
        days:(h>0&&h<=4)?0.5:1,code,note:printReason(r)});
    });
  });
  return rows;
}
function buildOtRows(reqs){
  const rows=[];
  reqs.forEach(r=>{
    const e=empById(r.empId);
    reqDays(r).forEach(d=>{
      const code=d.code||r.code||'OTD';
      // Ưu tiên mốc giờ người khai đã nhập; đơn cũ chưa có thì suy từ mã ca.
      let tIn=d.timeIn,tOut=d.timeOut,toIso=d.isoEnd||'';
      if(!tIn||!tOut){
        const b=baseShiftOf(code)||'D';const hh=SHIFT_HOURS[b];
        tIn=hh[0];tOut=hh[1];
        if(b==='N'&&!toIso)toIso=addDaysIso(d.iso,1);
      }
      if(!toIso)toIso=(tOut<=tIn)?addDaysIso(d.iso,1):d.iso;
      const hrs=d.hours||otHours(d.iso,tIn,toIso,tOut)||getHours(code);
      rows.push({name:e?e.name:r.empId,id:r.empId,dept:deptOf(r.empId),
        fromTime:tIn,fromDate:fmtVNfull(d.iso),toTime:tOut,toDate:fmtVNfull(toIso),
        hours:rnd1(hrs),note:printReason(r)});
    });
  });
  return rows;
}
function buildShiftRows(reqs){
  // mỗi ngày 1 dòng; đổi ca sinh 2 dòng (cả 2 người) để thấy rõ đổi qua đổi lại
  const rows=[];
  reqs.forEach(r=>{
    const a=empById(r.empId),b=r.withId?empById(r.withId):null;
    reqDays(r).forEach(d=>{
      const iso=d.iso;
      const beA=(r.before&&r.before[iso]!==undefined)?r.before[iso]:eff(r.empId,iso).code;
      if(r.type==='swap'&&b){
        const beB=(r.beforeW&&r.beforeW[iso]!==undefined)?r.beforeW[iso]:eff(r.withId,iso).code;
        // Người đứng đơn: lý do của chính họ (hoặc "Personal matter")
        rows.push({name:a?a.name:r.empId,id:r.empId,dept:deptOf(r.empId),
          oldCode:beA||'—',oldDate:fmtVNfull(iso),newCode:beB||'—',newDate:fmtVNfull(iso),
          note:printReason(r)});
        // Người nhận ca giúp: đúng cách ghi của biểu mẫu công ty
        rows.push({name:b?b.name:r.withId,id:r.withId,dept:deptOf(r.withId),
          oldCode:beB||'—',oldDate:fmtVNfull(iso),newCode:beA||'—',newDate:fmtVNfull(iso),
          note:coverReason(a?a.name:r.empId)});
      }else{
        rows.push({name:a?a.name:r.empId,id:r.empId,dept:deptOf(r.empId),
          oldCode:beA||'—',oldDate:fmtVNfull(iso),newCode:d.code||r.code||'—',newDate:fmtVNfull(iso),
          note:printReason(r)});
      }
    });
  });
  return rows;
}
function buildWtRows(reqs){
  const rows=[];
  reqs.forEach(r=>{
    const e=empById(r.empId);
    reqDays(r).forEach(d=>{
      const tIn=d.timeIn||r.timeIn||'', tOut=d.timeOut||r.timeOut||'';
      // giờ ra nhỏ hơn giờ vào → ca vắt qua nửa đêm, ngày ra là hôm sau
      const outIso=(tIn&&tOut&&tOut<tIn)?addDaysIso(d.iso,1):d.iso;
      rows.push({name:e?e.name:r.empId,id:r.empId,dept:deptOf(r.empId),
        inTime:tIn,inDate:fmtVNfull(d.iso),
        outTime:tOut,outDate:fmtVNfull(outIso),
        shiftLabel:shiftLabelOf(eff(r.empId,d.iso).code),
        reasonCode:r.reasonCode,reasonOther:r.reasonOther,
        guarantor:r.guarantorId?((empById(r.guarantorId)||{}).name||''):''});
    });
  });
  return rows;
}
function buildLateRows(reqs){
  const rows=[];
  reqs.forEach(r=>{
    const e=empById(r.empId);
    reqDays(r).forEach(d=>{
      const t1=d.timeIn||r.timeFrom||'',t2=d.timeOut||r.timeTo||'';
      let hrs=0;
      if(t1&&t2){const[h1,m1]=t1.split(':').map(Number),[h2,m2]=t2.split(':').map(Number);hrs=rnd1(((h2*60+m2)-(h1*60+m1))/60);if(hrs<0)hrs+=24;}
      const toIso=(t1&&t2&&t2<t1)?addDaysIso(d.iso,1):d.iso;
      rows.push({name:e?e.name:r.empId,id:r.empId,dept:deptOf(r.empId),
        fromTime:t1,fromDate:fmtVNfull(d.iso),toTime:t2,toDate:fmtVNfull(toIso),
        total:hrs,subType:r.subType==='leave_early'?'Leave early':'Come late',note:printReason(r)});
    });
  });
  return rows;
}
function buildMultiRows(reqs){
  return reqs.map(r=>{
    const e=empById(r.empId);
    let hrs=numDaysInc(r.from,r.to)*24;
    if(r.timeIn&&r.timeOut){
      const start=new Date(r.from+'T'+r.timeIn+':00'),end=new Date(r.to+'T'+r.timeOut+':00');
      hrs=rnd1((end-start)/3600000);
    }
    return{name:e?e.name:r.empId,id:r.empId,dept:deptOf(r.empId),
      inTime:r.timeIn||'',inDate:fmtVNfull(r.from),outTime:r.timeOut||'',outDate:fmtVNfull(r.to),
      total:hrs,note:printReason(r)};
  });
}
/* ============================================================
   BIỂU MẪU IN — dựng theo đúng file gốc của công ty
   "2023_HSVC - Timekeeping Form (New) VBA": mỗi sheet là một khổ
   A5 NGANG (paperSize 11, landscape), lề 0.1", font Times New Roman,
   tiêu đề 16pt đậm, bảng 11pt, chú giải 8pt, 10 dòng dữ liệu,
   khối chữ ký là 3 ô có viền (nhãn / chỗ ký / ghi rõ họ tên).
   Độ rộng cột dưới đây lấy nguyên từ độ rộng cột trong Excel.
   ============================================================ */
const LEGEND_LEAVE=`<div class="pp-legend"><b>Ký hiệu loại phép/ Leave type:</b><div class="pp-legend-grid">
<span>AL: Phép năm (Annual leave)</span><span>AAL: Phép năm thêm (Additional Annual leave)</span><span>COM: Nghỉ bù (Compensation)</span><span>FLE: Nghỉ tang (Funeral leave)</span>
<span>NPL: Nghỉ không lương (Unpaid leave)</span><span>LA: Nghỉ TNLĐ (Labor Accident)</span><span>CS: Con ốm (Children sick)</span><span>WB: Vợ sinh (Wife born)</span>
<span>SL: Nghỉ ốm (Sick leave)</span><span>WED: Nghỉ cưới (Wedding)</span><span>PC: Nghỉ khám thai (Pregnancy check)</span><span>WI: Vợ sinh hưởng BHXH (Wife born insurance)</span>
<span>NCN: Nghỉ nuôi con nhỏ (Nursing child)</span><span>MS: Nghỉ sảy thai (Miscarrige Leave)</span><span>SH: Nghỉ dưỡng sức (Save Health)</span><span>NVCT: Nghỉ CĐ người cao tuổi (Elderly employee)</span>
</div></div>`;
const LEGEND_SHIFT=`<div class="pp-legend"><b>Ký hiệu loại ca/ Shift type:</b><div class="pp-legend-grid2">
<span><b>D</b>: Ca ngày/ Day Shift (8:00 ~ 20:00)</span><span><b>O</b>: Ca hành chính/ Office Hour (8:00 ~ 17:00)</span>
<span><b>N</b>: Ca đêm/ Night Shift (20:00 ~ 8:00)</span><span><b>R</b>: Ngày nghỉ/ Off day</span>
</div></div>`;

/* Đầu đơn: logo (B1:D2) → tiêu đề Việt (A3) → tiêu đề Anh (A4) → ngày làm đơn canh phải (r5) */
function ppTop(titleVN,titleEN){
  return `<div class="pp-logorow"><img class="pp-logo" src="${LOGO_B64}" alt="Hyosung Vina Chemicals"></div>
    <div class="pp-t1">${titleVN}</div>
    <div class="pp-t2">${titleEN}</div>
    <div class="pp-date">Ngày làm đơn/ Date: ${fmtVNfull(todayIso())}</div>`;
}
/* Bảng có colgroup theo đúng tỉ lệ cột của Excel */
function ppTable(widths,thead,tbody){
  const tot=widths.reduce((a,b)=>a+b,0);
  return `<table class="pp-tbl"><colgroup>${
    widths.map(w=>`<col style="width:${(w/tot*100).toFixed(3)}%">`).join('')
  }</colgroup><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}
/* Khối chữ ký: 3 hàng có viền — nhãn / chỗ ký trống / ghi rõ họ tên */
function ppSign(spans,blocks){
  const tot=spans.reduce((a,b)=>a+b,0);
  return `<table class="pp-sign"><colgroup>${
    spans.map(w=>`<col style="width:${(w/tot*100).toFixed(3)}%">`).join('')
  }</colgroup><tbody>
    <tr class="lb">${blocks.map(b=>`<td>${b.vn}<br><i>${b.en}</i></td>`).join('')}</tr>
    <tr class="sp">${blocks.map(()=>'<td></td>').join('')}</tr>
    <tr class="nm">${blocks.map(b=>`<td>Ghi rõ họ tên/ Full name:<br><b>${esc(b.name||'')}</b></td>`).join('')}</tr>
  </tbody></table>`;
}
function signBlocks(opts){
  opts=opts||{};
  const b=[{vn:'Người làm đơn',en:'Written by',name:opts.writer||''}];
  if(opts.hasGuarantor)b.push({vn:'Xác nhận bởi Người bảo lãnh',en:'Confirmed by',name:opts.guarantor||''});
  b.push({vn:'Phê duyệt bởi cấp trên trực tiếp',en:'Approved by immediate superior',name:S.settings.approver1||''});
  b.push({vn:'Phê duyệt bởi Trưởng Bộ Phận',en:'Approved by Dept. Chief',name:S.settings.approver2||''});
  return b;
}
/* Excel luôn đánh số STT 1→10 kể cả dòng trống */
function ppRows(rows,nCol,cellsOf){
  let h='';
  for(let i=0;i<PP_ROWS;i++){
    const r=rows[i];
    h+=`<tr>${r?cellsOf(r,i):`<td>${i+1}</td>`+'<td></td>'.repeat(nCol-1)}</tr>`;
  }
  return h;
}
const PP_ROWS=10;
function ppWrap(solo,inner){return `<div class="form-a5${solo?' solo':''}">${inner}</div>`;}

/* ---------- ĐƠN XIN NGHỈ PHÉP (sheet "Leave", A1:K27) ---------- */
const W_LEAVE=[4.8,22.8,12.8,15.8,6.8,10.8,6.8,10.8,8.8,16.2,16.5];
function pageLeave(rows,solo){
  const thead=`
   <tr><th rowspan="3">STT<br>No.</th><th rowspan="3">Họ và tên<br>Full name</th>
       <th rowspan="3">MSNV<br>Employee Code</th><th rowspan="3">Bộ phận<br>Dept.</th>
       <th colspan="5">Thời gian xin nghỉ/ Leave time</th>
       <th rowspan="3">Loại phép<br>Leave type</th><th rowspan="3">Lý do xin nghỉ<br>Leave Reason</th></tr>
   <tr><th colspan="2">Từ/ From</th><th colspan="2">Đến/ To</th><th rowspan="2">Tổng ngày nghỉ<br>Total</th></tr>
   <tr><th>Giờ<br>Hour</th><th>Ngày<br>Date</th><th>Giờ<br>Hour</th><th>Ngày<br>Date</th></tr>`;
  const body=ppRows(rows,11,(r,i)=>
    `<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
     <td>${esc(r.fromTime)}</td><td>${esc(r.fromDate)}</td><td>${esc(r.toTime)}</td><td>${esc(r.toDate)}</td>
     <td>${r.days}</td><td>${esc(r.code)}</td><td class="l">${esc(r.note)}</td>`);
  return ppWrap(solo,ppTop('ĐƠN XIN NGHỈ PHÉP','APPLICATION FOR LEAVE')
    +ppTable(W_LEAVE,thead,body)
    +ppSign([40.4,40.2,52.3],signBlocks({writer:rows[0]&&rows[0].name}))
    +LEGEND_LEAVE);
}

/* ---------- ĐƠN TĂNG CA (sheet "Overtime", A1:K21) ---------- */
const W_OT=[4.8,21.6,12.8,13.5,7.8,10.8,7.8,10.8,8.8,21.2,10.8];
function pageOt(rows,solo){
  const thead=`
   <tr><th rowspan="3">STT<br>No.</th><th rowspan="3">Họ và tên<br>Full name</th>
       <th rowspan="3">MSNV<br>Employee Code</th><th rowspan="3">Bộ phận<br>Dept.</th>
       <th colspan="5">Thời gian tăng ca/ Overtime time</th>
       <th rowspan="3">Lý do tăng ca<br>Overtime Reason</th><th rowspan="3">Chữ ký<br>Signature</th></tr>
   <tr><th colspan="2">Từ/ From</th><th colspan="2">Đến/ To</th><th rowspan="2">Tổng giờ tăng ca<br>Total</th></tr>
   <tr><th>Giờ<br>Hour</th><th>Ngày<br>Date</th><th>Giờ<br>Hour</th><th>Ngày<br>Date</th></tr>`;
  const body=ppRows(rows,11,(r,i)=>
    `<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
     <td>${esc(r.fromTime)}</td><td>${esc(r.fromDate)}</td><td>${esc(r.toTime)}</td><td>${esc(r.toDate)}</td>
     <td>${r.hours}</td><td class="l">${esc(r.note)}</td><td></td>`);
  return ppWrap(solo,ppTop('ĐƠN TĂNG CA','APPLICATION FOR OVERTIME (OT)')
    +ppTable(W_OT,thead,body)
    +ppSign([39.2,39.9,51.6],signBlocks({writer:rows[0]&&rows[0].name})));
}

/* ---------- ĐƠN XIN ĐỔI CA (sheet "Change shift", A1:I27) ---------- */
const W_SHIFT=[5.8,26.8,15.8,16.8,8.8,12.8,8.8,12.8,25.8];
function pageShift(rows,solo){
  const thead=`
   <tr><th rowspan="2">STT<br>No.</th><th rowspan="2">Họ và tên<br>Full name</th>
       <th rowspan="2">MSNV<br>Employee Code</th><th rowspan="2">Bộ phận<br>Dept.</th>
       <th colspan="2">Ca cũ/ Old shift</th><th colspan="2">Ca mới xin đổi/ New shift</th>
       <th rowspan="2">Lý do xin đổi<br>Reason</th></tr>
   <tr><th>Ca<br>Shift</th><th>Ngày<br>Date</th><th>Ca<br>Shift</th><th>Ngày<br>Date</th></tr>`;
  const body=ppRows(rows,9,(r,i)=>
    `<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
     <td>${esc(r.oldCode)}</td><td>${esc(r.oldDate)}</td><td>${esc(r.newCode)}</td><td>${esc(r.newDate)}</td>
     <td class="l">${esc(r.note)}</td>`);
  return ppWrap(solo,ppTop('ĐƠN XIN ĐỔI CA','APPLICATION FOR CHANGING THE SHIFT')
    +ppTable(W_SHIFT,thead,body)
    +ppSign([48.4,47.2,38.6],signBlocks({writer:rows[0]&&rows[0].name}))
    +LEGEND_SHIFT);
}

/* ---------- ĐƠN XÁC NHẬN BỔ SUNG CÔNG (sheet "WT Confirmation", A1:J21) ---------- */
const W_WT=[4.8,20.8,12.8,15.8,7.8,10.8,7.8,10.8,7.8,24.8];
function pageWt(rows,solo){
  const first=rows[0]||{};
  const reasonHtml=WT_REASONS.map(x=>`<div>${x.v===first.reasonCode?'☑':'☐'} ${x.vn}/ ${x.en}${
    x.v==='other'&&first.reasonCode==='other'?': '+esc(first.reasonOther||''):''}</div>`).join('');
  const thead=`
   <tr><th rowspan="2">STT<br>No.</th><th rowspan="2">Họ và tên<br>Full name</th>
       <th rowspan="2">MSNV<br>Employee Code</th><th rowspan="2">Bộ phận<br>Dept.</th>
       <th colspan="5">Thời gian làm việc/ Working time</th>
       <th rowspan="2">Lý do/ Reason</th></tr>
   <tr><th>Giờ vào<br>In</th><th>Ngày<br>Date</th><th>Giờ ra<br>Out</th><th>Ngày<br>Date</th><th>Ca làm<br>Shift</th></tr>`;
  let body='';
  for(let i=0;i<PP_ROWS;i++){
    const r=rows[i];
    body+='<tr>'+(r
      ?`<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
        <td>${esc(r.inTime)}</td><td>${esc(r.inDate)}</td><td>${esc(r.outTime)}</td><td>${esc(r.outDate)}</td>
        <td>${esc(r.shiftLabel)}</td>`
      :`<td>${i+1}</td>`+'<td></td>'.repeat(8))
      +(i===0?`<td rowspan="${PP_ROWS}" class="l pp-wt-reason">${reasonHtml}</td>`:'')+'</tr>';
  }
  return ppWrap(solo,ppTop('ĐƠN XÁC NHẬN BỔ SUNG CÔNG','APPLICATION FOR WORKING TIME CONFIRMATION')
    +ppTable(W_WT,thead,body)
    +ppSign([25.6,28.6,37.2,32.6],signBlocks({writer:first.name,hasGuarantor:true,guarantor:first.guarantor})));
}

/* ---------- ĐƠN XIN ĐI TRỄ / VỀ SỚM (sheet "Leave Early", A1:K22) ---------- */
const W_LATE=[4.8,22.8,12.8,10.2,8.5,11.5,10.8,9.2,8.8,15.2,15.8];
function pageLate(rows,solo){
  const thead=`
   <tr><th rowspan="3">STT<br>No.</th><th rowspan="3">Họ và tên<br>Full name</th>
       <th rowspan="3">MSNV<br>Employee Code</th><th rowspan="3">Bộ phận<br>Dept.</th>
       <th colspan="5">Thời gian/ Time</th>
       <th rowspan="3">Loại đơn<br>Application type</th><th rowspan="3">Lý do xin nghỉ<br>Leave Reason</th></tr>
   <tr><th colspan="2">Từ/ From</th><th colspan="2">Đến/ To</th><th rowspan="2">Tổng<br>Total</th></tr>
   <tr><th>Giờ<br>Hour</th><th>Ngày<br>Date</th><th>Giờ<br>Hour</th><th>Ngày<br>Date</th></tr>`;
  const body=ppRows(rows,11,(r,i)=>
    `<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
     <td>${esc(r.fromTime)}</td><td>${esc(r.fromDate)}</td><td>${esc(r.toTime)}</td><td>${esc(r.toDate)}</td>
     <td>${r.total}</td><td>${esc(r.subType)}</td><td class="l">${esc(r.note)}</td>`);
  return ppWrap(solo,ppTop('ĐƠN XIN ĐI TRỄ/ VỀ SỚM','APPLICATION FOR COME LATE/ LEAVE EARLY')
    +ppTable(W_LATE,thead,body)
    +ppSign([40.4,41.0,49.0],signBlocks({writer:rows[0]&&rows[0].name}))
    +LEGEND_LEAVE);
}

/* ---------- ĐƠN LÀM VIỆC LIÊN TỤC NHIỀU NGÀY (sheet "Work multiple days", A1:K21) ---------- */
const W_MULTI=[4.8,23.8,12.8,13.2,7.5,11.2,7.8,11.2,10.8,19.8,10.5];
function pageMulti(rows,solo){
  const thead=`
   <tr><th rowspan="2">STT<br>No.</th><th rowspan="2">Họ và tên<br>Full name</th>
       <th rowspan="2">MSNV<br>Employee Code</th><th rowspan="2">Bộ phận<br>Dept.</th>
       <th colspan="5">Thời gian làm việc/ Working time</th>
       <th rowspan="2">Lý do/ Reason</th><th rowspan="2">Chữ ký/ Signature</th></tr>
   <tr><th>Giờ vào<br>In</th><th>Ngày<br>Date</th><th>Giờ ra<br>Out</th><th>Ngày<br>Date</th><th>Tổng cộng/ Total</th></tr>`;
  const body=ppRows(rows,11,(r,i)=>
    `<td>${i+1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.id)}</td><td class="l">${esc(r.dept)}</td>
     <td>${esc(r.inTime)}</td><td>${esc(r.inDate)}</td><td>${esc(r.outTime)}</td><td>${esc(r.outDate)}</td>
     <td>${r.total}</td><td class="l">${esc(r.note)}</td><td></td>`);
  return ppWrap(solo,ppTop('ĐƠN XÁC NHẬN LÀM VIỆC LIÊN TỤC NHIỀU NGÀY','APPLICATION FOR WORKING CONTINUOUSLY MULTIPLE DAYS')
    +ppTable(W_MULTI,thead,body)
    +ppSign([41.4,39.7,52.3],signBlocks({writer:rows[0]&&rows[0].name})));
}

const FORM_DEFS={
  leave:{label:'Nghỉ phép',build:buildLeaveRows,page:pageLeave},
  shift:{label:'Đổi ca',build:buildShiftRows,page:pageShift},
  ot:{label:'Tăng ca',build:buildOtRows,page:pageOt},
  wt:{label:'Bổ sung công',build:buildWtRows,page:pageWt},
  late:{label:'Đi trễ/Về sớm',build:buildLateRows,page:pageLate},
  multi:{label:'Làm liên tục nhiều ngày',build:buildMultiRows,page:pageMulti}
};
function setPageDyn(layout){
  // Khai báo khổ giấy với trình duyệt theo bố cục.
  // a5  = mỗi đơn 1 tờ A5 ngang, lề 2.5mm — ĐÚNG CHUẨN file gốc của công ty
  //       (paperSize 11 = A5, landscape, margin 0.1 inch)
  // 2up = 2 đơn xếp dọc trên 1 tờ A4 đứng cho đỡ tốn giấy
  const st=document.getElementById('pageDyn');
  if(st)st.textContent=layout==='a5'?'@page{size:A5 landscape;margin:2.5mm}':'@page{size:A4 portrait;margin:6mm}';
}
function wrapPrintPages(formPages,layout){
  if(layout==='a5')return formPages.map(p=>`<div class="print-page">${p}</div>`).join('');
  let html='';
  for(let i=0;i<formPages.length;i+=2){
    const p2=formPages[i+1]?formPages[i+1]:'<div class="form-a5" style="visibility:hidden"></div>';
    html+=`<div class="print-page">${formPages[i]}${p2}</div>`;
  }
  return html;
}
function printOne(reqId){
  if(isMobile()){toast(t('Điện thoại không in được — dùng máy tính để in đơn'));return;}
  const r=S.requests[reqId];if(!r){toast(t('Không tìm thấy đơn'));return;}
  const key=reqFormType(r);
  const def=FORM_DEFS[key];if(!def){toast('Loại đơn không hỗ trợ in');return;}
  const rows=def.build([r]);
  if(!rows.length){toast('Đơn không có dòng nào để in');return;}
  // in lẻ 1 đơn → tờ A5 ngang, chữ to (>10 dòng thì tách thêm tờ)
  setPageDyn('a5');
  $('printRoot').innerHTML=wrapPrintPages(chunk10(rows).map(c=>def.page(c,true)),'a5');
  $('printRoot').className='layout-a5';
  setTimeout(()=>window.print(),80);
}
let _toastPrintId=null;
function toastWithPrint(msg,reqId){
  _toastPrintId=reqId;
  const t=$('toast');
  t.innerHTML=esc(msg)+' <button class="btn sm" style="margin-left:8px;background:var(--accent);color:#1a1a1a" onclick="printFromToast()">In đơn ngay</button>';
  t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>{t.style.display='none';t.innerHTML='';},5200);
}
function printFromToast(){if(_toastPrintId)printOne(_toastPrintId);}

/* ============================================================
   MÀN IN ĐƠN
   Một danh sách duy nhất chia 2 nhóm:
     · CHƯA IN — mặc định tích chọn HẾT
     · ĐÃ IN   — mặc định BỎ tích hết (chỉ tích lại khi cần in bù)
   Ai đăng nhập cũng in được. Riêng điện thoại thì ẩn hẳn chức năng in
   vì công ty không cho điện thoại kết nối máy in.
   ============================================================ */
function pbAllInRange(){
  const from=$('pbFrom')?$('pbFrom').value:'', to=$('pbTo')?$('pbTo').value:'';
  return Object.values(S.requests).filter(r=>{
    if(r.status!=='approved')return false;
    if(from&&r.to<from)return false;
    if(to&&r.from>to)return false;
    return true;
  }).sort((a,b)=>a.from.localeCompare(b.from));
}
function pendingPrintQueue(){return pbAllInRange().filter(r=>!r.printedAt&&!r.noPrint);}
function pendingPrintCountAll(){return Object.values(S.requests).filter(r=>r.status==='approved'&&!r.printedAt&&!r.noPrint).length;}

function openPrintBulk(){
  if(isMobile()){toast(t('Điện thoại không in được — dùng máy tính để in đơn'));return;}
  $('pbFrom').value='';$('pbTo').value='';
  if($('pbSearchName'))$('pbSearchName').value='';
  renderPrintBulkList();
  $('printMask').classList.add('on');
}
function closePrintBulk(){$('printMask').classList.remove('on');}

/* Vẽ danh sách; giữ lại lựa chọn cũ nếu người dùng đã tự tích/bỏ tích */
function renderPrintBulkList(keep){
  const prev={};
  if(keep)document.querySelectorAll('.pbChk').forEach(c=>{prev[c.value]=c.checked;});
  const list=pbAllInRange();
  const q=(($('pbSearchName')&&$('pbSearchName').value)||'').trim();
  const nq=noAccent(q);
  const match=r=>{
    if(!nq)return true;
    const e=empById(r.empId),w=r.withId?empById(r.withId):null;
    return noAccent([e&&e.name,r.empId,w&&w.name].filter(Boolean).join(' ')).includes(nq);
  };
  const notYet=list.filter(r=>!r.printedAt&&!r.noPrint&&match(r));
  const noNeed=list.filter(r=>!r.printedAt&&r.noPrint&&match(r));
  const done  =list.filter(r=>r.printedAt&&match(r));

  const row=(r,def)=>{
    const e=empById(r.empId);
    const checked=(prev[r.id]!==undefined)?prev[r.id]:def;
    const days=r.type==='multi'?0:reqDays(r).length;
    return `<label class="pb-row${r.printedAt?' done':''}${r.noPrint?' noprint':''}">
      <input type="checkbox" class="pbChk" value="${r.id}" ${checked?'checked':''}>
      <span class="ic">${REQ_ICON[r.type]||'📄'}</span>
      <span class="tx"><b>${esc(e?e.name:r.empId)}</b>
        <i>${esc(REQ_LABEL[r.type]||r.type)} · ${fmtVN(r.from)}${r.to!==r.from?'–'+fmtVN(r.to):''}${days>1?' · '+days+' '+t('ngày'):''}</i></span>
      ${r.printedAt?`<span class="pb-when">🖨️ ${fmtDateTime(r.printedAt)}${r.printCount>1?' ×'+r.printCount:''}</span>`
        :r.noPrint?`<button type="button" class="btn sec sm" onclick="pbToggleNoPrint('${r.id}',event)" title="Chuyển sang cần in">↩ Cần in</button>`:''}
    </label>`;
  };
  const group=(title,arr,def,cls)=>`<div class="pb-grp ${cls}">
      <div class="pb-grp-h">
        <label><input type="checkbox" ${arr.length&&arr.every(r=>(prev[r.id]!==undefined?prev[r.id]:def))?'checked':''}
               onchange="pbCheckGroup('${cls}',this.checked)"> <b>${title}</b> <i>${arr.length}</i></label>
      </div>
      ${arr.length?arr.map(r=>row(r,def)).join(''):'<p class="muted sm2" style="padding:6px 4px">—</p>'}
    </div>`;

  $('pbList').innerHTML =
      group(t('Chưa in'),notYet,true,'notyet')
    + (noNeed.length?group(t('Không cần in'),noNeed,false,'noprint'):'')
    + group(t('Đã in rồi'),done,false,'done');
  document.querySelectorAll('.pbChk').forEach(c=>c.onchange=updatePbCountHint);
  updatePbCountHint();
  refreshPrintBadge();
}
function pbCheckGroup(cls,on){
  document.querySelectorAll('.pb-grp.'+cls+' .pbChk').forEach(c=>{c.checked=!!on;});
  updatePbCountHint();
}
/* Đổi đơn "không cần in" → "cần in" ngay trong danh sách in */
function pbToggleNoPrint(id,ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  const r=S.requests[id];if(!r)return;
  r.noPrint=!r.noPrint;save();
  renderPrintBulkList(true);
  if(typeof renderAppr==='function'&&curView==='appr')renderApprList();
}
function pbSelectedRequests(){return[...document.querySelectorAll('.pbChk:checked')].map(c=>S.requests[c.value]).filter(Boolean);}
function updatePbCountHint(){
  const sel=pbSelectedRequests();
  const parts=[];
  Object.entries(FORM_DEFS).forEach(([key,def])=>{
    const reqs=sel.filter(r=>reqFormType(r)===key);
    if(!reqs.length)return;
    const rows=def.build(reqs);
    parts.push(`${def.label}: ${rows.length} ${t('dòng')} → ${chunk10(rows).length} ${t('tờ')}`);
  });
  $('pbCountHint').innerHTML=parts.length?parts.join(' · '):t('Chưa chọn đơn nào.');
}

/* Dựng trang in cho một danh sách đơn rồi gọi hộp in của trình duyệt */
function printRequests(reqs,layout,onDone){
  if(isMobile()){toast(t('Điện thoại không in được — dùng máy tính để in đơn'));return;}
  layout=layout||'a5';
  const allPages=[],groups=[];
  Object.entries(FORM_DEFS).forEach(([key,def])=>{
    const g=reqs.filter(r=>reqFormType(r)===key);
    if(!g.length)return;
    const rows=def.build(g);
    const chunks=chunk10(rows);
    chunks.forEach(c=>allPages.push(def.page(c,layout==='a5')));
    groups.push({formType:key,reqs:g,rowsN:rows.length,pagesN:chunks.length});
  });
  if(!allPages.length){toast(t('Không có nội dung để in'));return;}
  setPageDyn(layout);
  $('printRoot').innerHTML=wrapPrintPages(allPages,layout);
  $('printRoot').className=layout==='a5'?'layout-a5':'';
  setTimeout(()=>{window.print();if(onDone)onDone(groups,reqs);},150);
}
function doPrintBulk(){
  const sel=pbSelectedRequests();
  if(!sel.length){toast(t('Chưa chọn đơn nào'));return;}
  const layout=$('pbLayout').value;
  closePrintBulk();
  printRequests(sel,layout,(groups)=>{
    if(!confirm(t('Đã in thành công? Đánh dấu đã in (')+sel.length+' '+t('đơn)?')))return;
    const now=Date.now();
    S.printLog=S.printLog||{};
    groups.forEach(g=>{
      S.printLog[uid()]={ts:now,by:meId()||'manager',formType:g.formType,reqIds:g.reqs.map(r=>r.id),rows:g.rowsN,pages:g.pagesN,reprint:false};
      g.reqs.forEach(r=>{const rr=S.requests[r.id];if(rr){rr.printedAt=now;rr.printCount=(rr.printCount||0)+1;}});
    });
    save();renderAppr();refreshPrintBadge();toast(t('Đã đánh dấu đã in ✔'));
  });
}
function refreshPrintBadge(){
  const n=pendingPrintCountAll();
  [$('printBdgSheet'),$('printBdgAppr'),$('printBdgCal')].forEach(b=>{if(!b)return;b.style.display=n?'':'none';b.textContent=n;});
}
