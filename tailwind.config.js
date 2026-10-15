/** @type {import('tailwindcss').Config} */
export default {
  // เปิดโหมด Dark แบบคลาส
  darkMode: 'class',
  // กำหนดไฟล์ที่ Tailwind ควรเข้าไปอ่านเพื่อหา Class
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}