import { useState, useEffect, useMemo, memo } from 'react';

// --- Helper Functions ---
const generatePromptPayPayload = (phoneNumber, amount) => {
    const target = phoneNumber.replace(/^0/, '66');
    const f01 = '00' + target; 
    const tag29Value = '0016A000000677010111' + '01' + String(f01.length).padStart(2,'0') + f01;
    const tag29 = '29' + String(tag29Value.length).padStart(2,'0') + tag29Value;
    const tag53 = '5303764';
    const amtStr = amount.toFixed(2);
    const tag54 = '54' + String(amtStr.length).padStart(2,'0') + amtStr;
    const tag58 = '5802TH';
    const data = '000201' + '010212' + tag29 + tag53 + tag54 + tag58 + '6304';
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF; x ^= x >> 4; crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return data + crc.toString(16).toUpperCase().padStart(4, '0');
};

const createQRWithLogo = (payload, size, shopLogoUrl) => {
    return new Promise((resolve) => {
        const qr = new window.QRious({ value: payload, size: size, level: 'H' });
        const qrBase64 = qr.toDataURL();
        
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const qrImg = new Image();
        qrImg.onload = () => {
            ctx.drawImage(qrImg, 0, 0);
            const drawLogo = (imgSrc, isFallback = false) => {
                const logoImg = new Image();
                logoImg.crossOrigin = "Anonymous";
                logoImg.onload = () => {
                    const logoSize = size * 0.22;
                    const x = (size - logoSize) / 2;
                    const y = (size - logoSize) / 2;
                    const pad = 6;
                    
                    ctx.fillStyle = 'white';
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2, 8);
                        ctx.fill();
                    } else {
                        ctx.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2);
                    }
                    
                    ctx.drawImage(logoImg, x, y, logoSize, logoSize);
                    resolve(canvas.toDataURL('image/png'));
                };
                logoImg.onerror = () => {
                    if (!isFallback) drawLogo("https://upload.wikimedia.org/wikipedia/commons/e/e0/PromptPay-logo.png", true);
                    else resolve(qrBase64);
                };
                logoImg.src = imgSrc;
            };
            if (shopLogoUrl) drawLogo(shopLogoUrl);
            else drawLogo("https://upload.wikimedia.org/wikipedia/commons/e/e0/PromptPay-logo.png", true);
        };
        qrImg.src = qrBase64;
    });
};

const safeJsonParse = (str, fallback = {}) => {
    if (!str || str === '-') return fallback;
    if (typeof str !== 'string') return str;
    try { 
        let cleanStr = str.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        return JSON.parse(cleanStr); 
    } catch (e) { 
        console.warn('JSON Parse Error:', str); 
        return fallback; 
    }
};

const formatMoney = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fetchWithTimeout = async (resource, options = {}) => {
    const { timeout = 30000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

const compressImage = async (file, quality = 0.9, maxWidth = 1000) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                const head = 'data:image/jpeg;base64,';
                const sizeInBytes = Math.round((dataUrl.length - head.length) * 3 / 4);
                
                if (sizeInBytes > 500000 && quality > 0.3) resolve(compressImage(file, quality - 0.2, maxWidth * 0.8)); 
                else resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxQwfb8tpHoZg1z4UnjtMH-I96WNDPNga0pZbc9fQkSY0jTow1gDvD4M_ek_G-bl1hx7g/exec"; 
const LIFF_ID = "2009648742-60i8g5vt"; 
const PROMPTPAY_PHONE = "0615924262";
const PROMPTPAY_NAME = "อลงกต ทวีผ่อง";

const DEFAULT_CONFIG = {
    headerTitle: 'ขนำลุงดำ - Khanamlungdam',
    headerDesc: '🏡 ขนำลุงดำ ดั้งเดิมมาจากหนำปู่ หรือที่พักตอนปู่มาอยู่ช่วงทำสวนนั้นเอง...',
    bannerUrl: 'https://img5.pic.in.th/file/secure-sv1/LINE_ALBUM__240916_14dd72f9bd7de4facf.jpg',
    logoUrl: 'https://lh3.googleusercontent.com/pw/AP1GczPi_rYAbsNGi4X96mW5koYl0JJ3BN9ipRf6UgsXAOQgkyhrs2ChGcZlbsuQ3OLJOYnYhSTYJhWUuu2hwWtPqlt4MUfdUDSS3s4RdRLeD36gPLiK-8OhYLXWmqxVLh2eOtkLIx7pQxrQA6ZnqBYHOftH=w913-h913-s-no-gm?authuser=0',
    roomImages: {}, foodMenu: [], roomDescriptions: {}
};

const DEFAULT_POSITIONS = { 'R1': {x: 20, y: 30}, 'R2': {x: 40, y: 50}, 'R3': {x: 60, y: 50}, 'T1': {x: 25, y: 70}, 'T2': {x: 35, y: 75}, 'K1': {x: 70, y: 70}, 'K2': {x: 80, y: 70}, 'Z8': {x: 50, y: 20} };

const CampingLoaderOverlay = ({ text = "กำลังเตรียมพื้นที่กางเต็นท์..." }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] transition-opacity">
        <div className="bg-white dark:bg-gray-800 px-10 py-8 rounded-3xl shadow-2xl flex flex-col items-center animate-pop border-t-4 border-green-500">
            <div className="relative w-24 h-20 mb-6 flex items-center justify-center">
                <i className="fas fa-tree text-green-500 text-5xl absolute -left-6 animate-pulse"></i>
                <i className="fas fa-campground text-green-600 text-6xl relative z-10 animate-bounce"></i>
                <i className="fas fa-tree text-green-600 text-4xl absolute -right-4 animate-pulse" style={{animationDelay: '0.3s'}}></i>
                <i className="fas fa-fire text-orange-500 text-3xl absolute bottom-0 right-2 animate-pulse" style={{animationDelay: '0.5s'}}></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2 tracking-wide text-center">{text}</h3>
            <div className="flex gap-2 mt-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
            </div>
        </div>
    </div>
);

// --- Shared Admin Variables ---
const SHOP_PHONE = "061-592-4262"; 
let ROOM_IDS = ['R1','R2','R3','T1','T2','K1','K2','Z8'];
let ROOM_NAMES = { 'R1': 'โฮมสเตย์หนำโป', 'R2': 'บ้านพักริมน้ำ 1', 'R3': 'บ้านพักริมน้ำ 2', 'T1': 'เต็นท์กระโจม 1', 'T2': 'เต็นท์กระโจม 2', 'K1': 'เช่าเต็นท์สนาม K1', 'K2': 'เช่าเต็นท์สนาม K2', 'Z8': 'ลานกางเต็นท์' };

const formatThaiDateGlobal = (dateStr) => {
    if(!dateStr || dateStr === '-') return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const CampingAdminLoader = ({ text = "กำลังโหลดข้อมูล..." }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] transition-opacity">
        <div className="bg-white px-10 py-8 rounded-3xl shadow-2xl flex flex-col items-center animate-pop border-t-4 border-green-600">
            <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
                <i className="fas fa-tree text-green-600 text-4xl absolute -left-4 animate-pulse"></i>
                <i className="fas fa-campground text-blue-600 text-6xl relative z-10 animate-bounce"></i>
                <i className="fas fa-fire text-orange-500 text-3xl absolute -right-2 bottom-0 animate-pulse" style={{animationDelay: '0.2s'}}></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 tracking-wide text-center">{text}</h3>
            <div className="flex gap-2 mt-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
            </div>
        </div>
    </div>
);

const StatusBadge = ({ status }) => { let color = 'bg-gray-100 text-gray-800'; const safeStatus = String(status || ''); if (safeStatus === 'รอตรวจสอบ') color = 'bg-yellow-100 text-yellow-800'; if (safeStatus === 'ยืนยัน') color = 'bg-green-100 text-green-800'; if (safeStatus.includes('ยกเลิก')) color = 'bg-red-100 text-red-800'; return <span className={`px-2 py-1 rounded text-xs font-bold border ${color}`}>{safeStatus}</span>; };

const BookingRow = memo(({ booking, onViewDetails, onUpdateStatus, onViewSlip }) => {
    const b = booking;
    return (
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition p-5 border-l-4 border-green-500 relative group">
            <div className="flex justify-between items-start mb-3">
                <div><div className="text-xs text-gray-400 font-mono mb-0.5">{b.id} • {b.timestamp.split(' ')[0]}</div><div className="font-bold text-lg text-gray-800">{b.name}</div></div>
                <StatusBadge status={b.status} />
            </div>
            <div className="text-sm text-gray-600 mb-3 space-y-1">
                <div className="flex items-center gap-2"><i className="fas fa-phone w-4 text-center text-gray-400"></i> <a href={`tel:${b.phone}`} className="hover:text-green-600">{b.phone}</a></div>
                <div className="flex items-center gap-2"><i className="fab fa-line w-4 text-center text-gray-400"></i> {b.lineProfile}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg text-sm mb-3 border border-gray-100">
                <div className="flex justify-between mb-1"><span>เข้าพัก:</span> <b className="text-gray-700">{formatThaiDateGlobal(b.checkIn)}</b></div>
                <div className="flex justify-between"><span>คืนห้อง:</span> <b className="text-gray-700">{formatThaiDateGlobal(b.checkOut)}</b></div>
                <hr className="my-2 border-gray-200"/>
                <div className="font-medium text-green-700 text-sm whitespace-pre-wrap"><i className="fas fa-home mr-1"></i> {b.rooms}</div>
                {b.food !== '-' && <div className="text-orange-600 text-xs mt-1"><i className="fas fa-utensils mr-1"></i> {b.food}</div>}
            </div>
            <div className="flex justify-between items-center bg-blue-50 p-2 rounded-lg mb-3">
                <div className="text-center px-2"><div className="text-[10px] text-gray-500">ยอดสุทธิ</div><div className="font-bold text-gray-800">{formatMoney(b.price)}</div></div>
                <div className="h-8 w-px bg-blue-200"></div>
                <div className="text-center px-2"><div className="text-[10px] text-gray-500">มัดจำ</div><div className="font-bold text-red-600">{formatMoney(b.deposit)}</div></div>
                <div className="h-8 w-px bg-blue-200"></div>
                <div className="text-center px-2"><div className="text-[10px] text-gray-500">คงเหลือ</div><div className="font-bold text-green-600">{formatMoney(Number(b.price || 0) - Number(b.deposit || 0))}</div></div>
            </div>
            <div className="flex justify-end gap-2">
                {String(b.slip || '').includes('http') && <button onClick={() => onViewSlip(b.slip)} className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 transition text-sm font-bold"><i className="fas fa-image mr-1"></i> สลิป</button>}
                <button onClick={() => onViewDetails(b)} className="bg-orange-50 text-orange-600 px-3 py-2 rounded-lg hover:bg-orange-100 transition text-sm font-bold"><i className="fas fa-edit mr-1"></i> จัดการ</button>
                {b.status === 'รอตรวจสอบ' && (<><button onClick={() => onUpdateStatus(b.id, 'ยืนยัน')} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition text-sm font-bold shadow-sm">ยืนยัน</button><button onClick={() => onUpdateStatus(b.id, 'ยกเลิก')} className="bg-white border border-red-200 text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 transition text-sm font-bold">ยกเลิก</button></>)}
            </div>
        </div>
    );
});

const AdminApp = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');
    
    const [bookings, setBookings] = useState([]);
    const [settings, setSettings] = useState({ discounts: [], closed: [], special: [], roomClosures: [] });
    const [siteSettings, setSiteSettings] = useState(null);
    const [savingSiteSettings, setSavingSiteSettings] = useState(false);
    const [roomConfig, setRoomConfig] = useState({});
    const [mapConfig, setMapConfig] = useState({});
    const [mapBackground, setMapBackground] = useState("https://img2.pic.in.th/3d539b84-44ce-4336-ad90-bd2f84b13eca.jpg");

    const [viewSlip, setViewSlip] = useState(null); 
    const [viewBooking, setViewBooking] = useState(null); 
    const [filter, setFilter] = useState('all'); 
    const [searchTerm, setSearchTerm] = useState(''); 

    const [rescheduleData, setRescheduleData] = useState(null);
    
    const [isCustomAddon, setIsCustomAddon] = useState(false);
    const [customAddonName, setCustomAddonName] = useState('');
    const [customAddonPrice, setCustomAddonPrice] = useState('');
    const [addonQty, setAddonQty] = useState(1);
    const [addonStatus, setAddonStatus] = useState('unpaid');

    const [editMode, setEditMode] = useState(null); 
    const [formDiscount, setFormDiscount] = useState({ code: '', type: 'FIXED', value: '' });
    const [formClosed, setFormClosed] = useState({ startDate: '', endDate: '', reason: '' });
    const [formSpecial, setFormSpecial] = useState({ startDate: '', endDate: '', desc: '' });
    const [formRoomClosure, setFormRoomClosure] = useState({ startDate: '', endDate: '', roomId: 'R1', reason: '' });

    const [showAdminBooking, setShowAdminBooking] = useState(false);
    const [adminBookingForm, setAdminBookingForm] = useState({ name: '', phone: '', checkIn: '', checkOut: '', rooms: [], price: '', deposit: '' });
    const [adminAvailability, setAdminAvailability] = useState(null); 

    const [editingRoom, setEditingRoom] = useState(null); 
    const [roomsMapData, setRoomsMapData] = useState([]);
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

    useEffect(() => {
        const storedPwd = sessionStorage.getItem('admin_pwd');
        if (storedPwd) {
            setPassword(storedPwd);
            setIsLoggedIn(true);
        }
    }, []);

    useEffect(() => {
        if(isLoggedIn && password) {
            setLoading(true);
            Promise.all([
                fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=getInitialData`).then(r => r.json()),
                fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAdminData', password: password }) }).then(r=>r.json())
            ]).then(([initRes, adminRes]) => {
                if(initRes.status === 'success') {
                    const { settings, siteConfig, roomConfig, mapConfig } = initRes.data;
                    setSettings(settings);
                    setSiteSettings(siteConfig);
                    setRoomConfig(roomConfig);
                    setMapConfig(mapConfig);
                    if (siteConfig?.roomImages?.['MAP_BG'] && siteConfig.roomImages['MAP_BG'].length > 0) {
                        setMapBackground(siteConfig.roomImages['MAP_BG'][0]);
                    }
                    const loadedIds = Object.keys(roomConfig);
                    if (loadedIds.length > 0) { ROOM_IDS = loadedIds; ROOM_NAMES = {}; loadedIds.forEach(id => ROOM_NAMES[id] = roomConfig[id].name); }
                }
                if(adminRes.status === 'success') {
                    setBookings(adminRes.data);
                }
                setLoading(false);
            }).catch(e => {
                console.error(e);
                setLoading(false);
            });
        }
    }, [isLoggedIn]);

    const showModal = (title, message, type = 'alert', onConfirm = null) => { setModal({ isOpen: true, title, message, type, onConfirm }); };
    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
    const alertMsg = (message, title = 'แจ้งเตือน', type = 'warning') => showModal(title, message, type, closeModal);
    const successMsg = (message) => alertMsg(message, 'สำเร็จ', 'success');
    const errorMsg = (message) => alertMsg(message, 'เกิดข้อผิดพลาด', 'error');
    const confirmMsg = (message, onConfirm) => showModal('ยืนยันการทำรายการ', message, 'confirm', () => { closeModal(); onConfirm(); });

    useEffect(() => {
        if (showAdminBooking && adminBookingForm.checkIn && adminBookingForm.checkOut) {
            if (adminBookingForm.checkIn < adminBookingForm.checkOut) {
                setLoading(true);
                setAdminBookingForm(prev => ({...prev, rooms: []})); 
                fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=getAvailability&checkIn=${adminBookingForm.checkIn}&checkOut=${adminBookingForm.checkOut}&_t=${Date.now()}`)
                    .then(r => r.json())
                    .then(res => { setLoading(false); if (res.status === 'success') setAdminAvailability(res); })
                    .catch(e => setLoading(false));
            }
        } else { setAdminAvailability(null); }
    }, [showAdminBooking, adminBookingForm.checkIn, adminBookingForm.checkOut]);

    const stats = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const totalRevenue = bookings.filter(b => b.status === 'ยืนยัน').reduce((sum, b) => sum + Number(b.deposit || 0), 0);
        const monthlyRevenue = bookings.filter(b => { const d = new Date(b.checkIn); return b.status === 'ยืนยัน' && d.getMonth() === currentMonth && d.getFullYear() === currentYear; }).reduce((sum, b) => sum + Number(b.deposit || 0), 0);
        const pendingCount = bookings.filter(b => b.status === 'รอตรวจสอบ').length;
        const monthlyCounts = Array(12).fill(0);
        bookings.forEach(b => { if (b.status !== 'ยกเลิก' && b.status !== 'Cancelled') { const d = new Date(b.checkIn); if (d.getFullYear() === currentYear) { monthlyCounts[d.getMonth()]++; } } });
        const upcoming = bookings.filter(b => { const checkIn = new Date(b.checkIn); const diffTime = checkIn - now; const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); return b.status === 'ยืนยัน' && diffDays >= 0 && diffDays <= 3; }).sort((a,b) => new Date(a.checkIn) - new Date(b.checkIn));
        return { totalRevenue, monthlyRevenue, pendingCount, monthlyCounts, upcoming };
    }, [bookings]);

    const filteredBookings = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        let result = bookings.filter(b => {
            const bCheckIn = new Date(b.checkIn);
            bCheckIn.setHours(0,0,0,0);
            let statusMatch = false;
            if (filter === 'all') statusMatch = true;
            else if (filter === 'pending') statusMatch = b.status === 'รอตรวจสอบ';
            else if (filter === 'confirmed') statusMatch = b.status === 'ยืนยัน'; 
            else if (filter === 'upcoming') statusMatch = b.status === 'ยืนยัน' && bCheckIn >= today;
            else if (filter === 'history') statusMatch = b.status === 'ยืนยัน' && bCheckIn < today;
            if (!statusMatch) return false;
            const term = searchTerm.toLowerCase();
            const bId = String(b.id || '').toLowerCase();
            const bName = String(b.name || '').toLowerCase();
            const bPhone = String(b.phone || '').toLowerCase();
            const bLine = String(b.lineProfile || '').toLowerCase();
            return bId.includes(term) || bName.includes(term) || bPhone.includes(term) || bLine.includes(term);
        });
        if (filter === 'upcoming') { result.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn)); }
        return result;
    }, [bookings, filter, searchTerm]);

    useEffect(() => {
        if (Object.keys(roomConfig).length > 0) {
            const combined = Object.values(roomConfig).map(r => ({
                ...r,
                x: mapConfig[r.id]?.x || 50,
                y: mapConfig[r.id]?.y || 50,
                desc: siteSettings?.roomDescriptions?.[r.id] || '',
                images: siteSettings?.roomImages?.[r.id] || []
            }));
            setRoomsMapData(combined);
        }
    }, [roomConfig, mapConfig, siteSettings]);

    const handleLogin = (e) => {
        e.preventDefault(); setLoading(true);
        fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'adminLogin', password: password }) })
        .then(r => r.json()).then(res => {
            setLoading(false);
            if (res.status === 'success') { 
                setIsLoggedIn(true); 
                sessionStorage.setItem('admin_pwd', password);
            } else errorMsg('รหัสผ่านไม่ถูกต้อง');
        }).catch(err => { setLoading(false); errorMsg('Connection Error: ' + err); });
    };
    
    const handleLogout = () => {
        sessionStorage.removeItem('admin_pwd');
        window.location.reload();
    }

    const fetchData = () => { setLoading(true); fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAdminData', password: password }) }).then(r => r.json()).then(res => { setLoading(false); if (res.status === 'success') setBookings(res.data); }).catch(e=>setLoading(false)); };
    const fetchInitialData = () => {
        setLoading(true);
        fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=getInitialData`).then(r => r.json()).then(res => {
            setLoading(false);
            if (res.status === 'success') {
                const { settings, siteConfig, roomConfig, mapConfig } = res.data;
                setSettings(settings); setSiteSettings(siteConfig); setRoomConfig(roomConfig); setMapConfig(mapConfig);
                if (siteConfig?.roomImages?.['MAP_BG'] && siteConfig.roomImages['MAP_BG'].length > 0) {
                    setMapBackground(siteConfig.roomImages['MAP_BG'][0]);
                }
            }
        }).catch(e=>setLoading(false));
    };

    const updateStatus = (id, newStatus) => {
        const actionText = newStatus === 'ยกเลิก' ? 'ยกเลิกรายการ' : `เปลี่ยนสถานะเป็น "${newStatus}"`;
        confirmMsg(`ยืนยันการ${actionText} ใช่หรือไม่?`, () => {
            setBookings(prev => prev.map(b => b.id === id ? {...b, status: newStatus} : b));
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updateStatus', bookingId: id, newStatus: newStatus, password: password }) });
            if (newStatus === 'ยกเลิก' && viewBooking && viewBooking.id === id) setViewBooking({...viewBooking, status: 'ยกเลิก'});
        });
    };

    const updateAdminRoomGuests = (roomId, delta) => {
        setAdminBookingForm(prev => ({
            ...prev,
            rooms: prev.rooms.map(r => {
                if (r.id === roomId) {
                    const config = roomConfig[roomId] || {};
                    let maxCap = config.maxCap || 10;
                    let min = config.min || 1;
                    if (roomId === 'Z8') maxCap = adminAvailability?.zone8Available || 20;
                    const newGuests = Math.max(min, Math.min(maxCap, r.guests + delta));
                    return { ...r, guests: newGuests };
                }
                return r;
            })
        }));
    };

    const handleCreateAdminBooking = () => {
        const { name, phone, checkIn, checkOut, rooms, price, deposit } = adminBookingForm;
        if(!name || !phone || !checkIn || !checkOut || rooms.length === 0 || !price) return alertMsg('กรุณากรอกข้อมูลให้ครบถ้วน');
        confirmMsg('ยืนยันสร้างรายการจอง?', () => {
            setLoading(true);
            const inDate = new Date(checkIn);
            const outDate = new Date(checkOut);
            const nights = Math.max(1, Math.round((outDate - inDate) / (1000 * 3600 * 24)));

            const cart = rooms.map(roomData => {
                const rConf = roomConfig[roomData.id];
                let pricePerNight = 0;
                let isPerHead = false;

                if (rConf) {
                    const searchStr = (rConf.type + " " + rConf.name).toLowerCase();
                    isPerHead = rConf.type === 'ground' || roomData.id === 'Z8' || roomData.id === 'R6528' || searchStr.includes('tent') || searchStr.includes('เต็นท์') || searchStr.includes('ลานกาง') || searchStr.includes('ground');
                    const pricingInfo = typeof rConf.pricing === 'string' ? safeJsonParse(rConf.pricing, {}) : (rConf.pricing || {});

                    if (isPerHead) {
                        pricePerNight = Number(pricingInfo.priceHead || (pricingInfo.tiers && pricingInfo.tiers.length > 0 ? pricingInfo.tiers[0].price : 150));
                    } else {
                        const tiers = pricingInfo.tiers || [];
                        if (tiers.length > 0) {
                            const tier = tiers.find(t => roomData.guests <= t.max);
                            if (tier) pricePerNight = Number(tier.price); 
                            else pricePerNight = Number(tiers[tiers.length - 1] ? tiers[tiers.length - 1].price : 0);
                        }
                    }
                }

                return {
                    id: roomData.id, name: ROOM_NAMES[roomData.id] || roomData.id,
                    type: rConf ? rConf.type : (roomData.id==='Z8'?'ground':(roomData.id.startsWith('K')?'tent_rent':(roomData.id.startsWith('T')?'tent':'room'))),
                    guests: roomData.guests, qty: 1, pricePerNight: pricePerNight, nights: nights, isPerHead: isPerHead
                };
            });
            const totalGuests = rooms.reduce((sum, r) => sum + r.guests, 0);

            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'createAdminBooking', password: password, customer: { name, phone }, checkIn, checkOut, totalGuests: totalGuests, cart: cart, price: parseFloat(price), deposit: parseFloat(deposit || price) })
            }).then(r => r.json()).then(res => { setLoading(false); if(res.status === 'success') { successMsg('สร้างรายการจองสำเร็จ'); fetchData(); setShowAdminBooking(false); setAdminBookingForm({ name: '', phone: '', checkIn: '', checkOut: '', rooms: [], price: '', deposit: '' }); setAdminAvailability(null); } else errorMsg('ไม่สำเร็จ: ' + res.message); }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e)); });
        });
    };

    const handleReschedule = () => {
        if(!rescheduleData.checkIn || !rescheduleData.checkOut) return alertMsg('กรุณาเลือกวันที่ให้ครบถ้วน');
        if(rescheduleData.checkIn >= rescheduleData.checkOut) return alertMsg('วันที่ออกต้องอยู่หลังวันที่เข้าพัก');
        confirmMsg('ยืนยันการเลื่อนวันเข้าพัก?', () => {
            setLoading(true);
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'rescheduleBooking', bookingId: rescheduleData.id, newCheckIn: rescheduleData.checkIn, newCheckOut: rescheduleData.checkOut, password: password }) 
            }).then(r => r.json()).then(res => { setLoading(false); if (res.status === 'success') { successMsg('เลื่อนวันสำเร็จเรียบร้อย'); setRescheduleData(null); setViewBooking(null); fetchData(); } else errorMsg('ไม่สำเร็จ: ' + res.message); }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e))});
        });
    };

    const handleAdminAddService = () => {
        if (!customAddonName || !customAddonPrice) return alertMsg('กรุณากรอกชื่อรายการและราคาให้ครบถ้วน');
        const itemPayload = { name: customAddonName, price: parseFloat(customAddonPrice), qty: parseInt(addonQty), status: addonStatus };
        const statusText = addonStatus === 'paid' ? 'จ่ายแล้ว (+ยอดมัดจำ)' : 'ยังไม่จ่าย (+ยอดคงเหลือ)';

        confirmMsg(`ยืนยันเพิ่มรายการ:\n${itemPayload.name} จำนวน ${itemPayload.qty}\nสถานะ: ${statusText}\n\n(ระบบจะบันทึกและคำนวณยอดอัตโนมัติ โดยไม่ส่งข้อความกวนลูกค้า)`, () => {
            setLoading(true);
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                body: JSON.stringify({ action: 'adminAddService', bookingId: viewBooking.id, item: itemPayload, password: password })
            }).then(r => r.json()).then(res => { 
                setLoading(false); 
                if(res.status === 'success') { 
                    successMsg('เพิ่มรายการลงในบิลเรียบร้อยแล้ว'); fetchData(); setViewBooking(null); setCustomAddonName(''); setCustomAddonPrice(''); setAddonQty(1); setAddonStatus('unpaid');
                } else { errorMsg('Error: ' + res.message); } 
            }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e)); });
        });
    };

    const handleSendReceipt = () => {
        if (!viewBooking) return;
        confirmMsg('ยืนยันการส่งข้อความ "ใบเสร็จรับเงิน" ให้ลูกค้าทาง LINE?', () => {
            setLoading(true);
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'sendReceipt', bookingId: viewBooking.id, password: password }) })
            .then(r => r.json()).then(res => { setLoading(false); if (res.status === 'success') { successMsg('ส่งใบเสร็จให้ลูกค้าเรียบร้อยแล้ว'); } else { errorMsg('ไม่สามารถส่งได้: ' + res.message); } }).catch(e => { setLoading(false); errorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ'); });
        });
    };

    const handleSaveSetting = (type, payload) => {
        const action = editMode ? 'editSetting' : 'addSetting'; const id = editMode ? editMode.id : null;
        if ((type !== 'discount') && (!payload.startDate || !payload.endDate)) return alertMsg('กรุณาระบุวันที่เริ่มต้นและสิ้นสุด');
        confirmMsg('ยืนยันการบันทึกข้อมูล?', () => {
            setLoading(true);
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action, type, id, payload, password: password }) }).then(r => r.json()).then(res => { setLoading(false); if (res.status === 'success') { successMsg('บันทึกสำเร็จ'); fetchInitialData(); setEditMode(null); setFormDiscount({ code: '', type: 'FIXED', value: '' }); setFormClosed({ startDate: '', endDate: '', reason: '' }); setFormSpecial({ startDate: '', endDate: '', desc: '' }); setFormRoomClosure({ startDate: '', endDate: '', roomId: 'R1', reason: '' }); } else errorMsg('บันทึกไม่สำเร็จ'); }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e))});
        });
    };
    
    const startEdit = (type, item) => alertMsg('การแก้ไขช่วงวันที่ต้องลบแล้วเพิ่มใหม่ครับ');
    const handleDeleteSetting = (type, id) => confirmMsg('ยืนยันการลบรายการนี้?', () => { setLoading(true); fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteSetting', type, id, password: password }) }).then(r => r.json()).then(res => { setLoading(false); if (res.status === 'success') fetchInitialData(); }); });
    const handleSaveSiteSettings = () => confirmMsg('ยืนยันบันทึกการตั้งค่าร้านค้า?', () => { setLoading(true); fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'saveSiteSettings', password: password, settings: siteSettings }) }).then(r => r.json()).then(res => { setLoading(false); if(res.status === 'success') { successMsg('บันทึกเรียบร้อย'); fetchInitialData(); } else errorMsg('บันทึกไม่สำเร็จ'); }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e)); }); });
    const handleImageUpload = async (file, callback) => { if(file) { try { const base64 = await compressImage(file); callback(base64); } catch(e) { errorMsg('Upload Failed'); } } };
    const handleMultipleImageUpload = async (files, callback) => { if (!files || files.length === 0) return; try { const promises = Array.from(files).map(file => compressImage(file)); const base64List = await Promise.all(promises); callback(base64List); } catch(e) { errorMsg('Upload Failed'); } };
    
    const handleExport = () => { const header = ["BookingID", "Date", "Customer", "Phone", "CheckIn", "CheckOut", "Rooms", "Total", "Deposit", "Status"]; const rows = bookings.map(b => [ b.id, b.timestamp, `"${b.name}"`, `'${b.phone}`, b.checkIn, b.checkOut, `"${b.rooms.replace(/"/g, '""')}"`, b.price, b.deposit, b.status ]); const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n"); const blob = new Blob(["\uFEFF"+csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", "bookings_lungdam.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    
    const handlePrintReport = () => { const style = document.createElement('style'); style.innerHTML = `@media print { @page { size: A4 landscape; margin: 0; } body { -webkit-print-color-adjust: exact; } #print-container { display: block !important; } #report-print-area { display: block !important; } #receipt-print-area { display: none !important; } #official-receipt-print-area { display: none !important; } }`; document.head.appendChild(style); window.print(); setTimeout(() => document.head.removeChild(style), 100); };
    const handlePrintReceipt = () => { const style = document.createElement('style'); style.innerHTML = `@media print { @page { size: A4 portrait; margin: 0; } body { -webkit-print-color-adjust: exact; } #print-container { display: block !important; } #receipt-print-area { display: block !important; } #report-print-area { display: none !important; } #official-receipt-print-area { display: none !important; } }`; document.head.appendChild(style); window.print(); setTimeout(() => document.head.removeChild(style), 100); };
    const handlePrintOfficialReceipt = () => { const style = document.createElement('style'); style.innerHTML = `@media print { @page { size: A4 portrait; margin: 0; } body { -webkit-print-color-adjust: exact; } #print-container { display: block !important; } #official-receipt-print-area { display: block !important; } #receipt-print-area { display: none !important; } #report-print-area { display: none !important; } }`; document.head.appendChild(style); window.print(); setTimeout(() => document.head.removeChild(style), 100); };

    const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
    const days = []; for(let i=0; i<firstDayOfMonth; i++) days.push(null); for(let i=1; i<=getDaysInMonth(calendarDate); i++) days.push(i);
    const getBookingsForDate = (day) => { if(!day) return []; const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; return bookings.filter(b => b.status !== 'ยกเลิก' && b.checkIn <= dateStr && b.checkOut > dateStr); };

    const handleMapClick = (e) => { if (!editingRoom) return; const rect = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width) * 100; const y = ((e.clientY - rect.top) / rect.height) * 100; setEditingRoom({ ...editingRoom, x: Math.round(x), y: Math.round(y) }); };

    const saveRoomChanges = () => {
        let finalRoomsData = [...roomsMapData];
        if (editingRoom) { const idx = finalRoomsData.findIndex(r => r.id === editingRoom.id); if (idx > -1) { finalRoomsData[idx] = editingRoom; } else { finalRoomsData.push(editingRoom); } }
        confirmMsg('ยืนยันการบันทึกข้อมูลห้องพักและแผนที่?', () => {
            setLoading(true);
            const rooms = finalRoomsData.map(r => ({ id: r.id, name: r.name, type: r.type, min: r.min, maxCap: r.maxCap, pricing: r.pricing, bf: r.bf }));
            const mapConfigObj = {}; finalRoomsData.forEach(r => mapConfigObj[r.id] = { x: r.x, y: r.y });
            const images = {}, descs = {}; finalRoomsData.forEach(r => { images[r.id] = r.images || []; descs[r.id] = r.desc || ''; });
            images['MAP_BG'] = [mapBackground];

            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'saveRoomSystem', password: password, rooms: rooms, mapConfig: mapConfigObj, siteSettings: { roomImages: images, roomDescriptions: descs } }) })
            .then(r => r.json()).then(res => { setLoading(false); if(res.status === 'success') { successMsg('บันทึกข้อมูลสำเร็จ'); setRoomsMapData(finalRoomsData); setMapConfig(mapConfigObj); fetchInitialData(); setEditingRoom(null); } else errorMsg('บันทึกไม่สำเร็จ: ' + res.message); }).catch(e => { setLoading(false); errorMsg(e.name === 'AbortError' ? 'เน็ตหมดเวลา' : String(e)); });
        });
    };

    const updateEditingRoomInList = () => { setRoomsMapData(prev => { const idx = prev.findIndex(r => r.id === editingRoom.id); if (idx > -1) { const newArr = [...prev]; newArr[idx] = editingRoom; return newArr; } return [...prev, editingRoom]; }); setEditingRoom(null); };

    if (!isLoggedIn) return ( 
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 relative"> 
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm z-10"> 
                <div className="text-center mb-6"><h1 className="text-3xl font-bold text-green-800">Admin Panel</h1><p className="text-gray-500">ขนำลุงดำ แคมป์ปิ้ง</p></div> 
                <form onSubmit={handleLogin} className="space-y-4"> 
                    <input type="password" placeholder="รหัสผ่าน" className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" value={password} onChange={e => setPassword(e.target.value)} /> 
                    <button disabled={loading} className="w-full bg-gray-800 text-white p-3 rounded-lg hover:bg-gray-700 transition font-bold shadow-lg">เข้าสู่ระบบ</button> 
                </form> 
            </div> 
            {modal.isOpen && ( 
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm transition-opacity"> 
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-pop"> 
                        <div className={`p-6 text-center ${modal.type==='error'?'bg-red-50':''}`}> 
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${modal.type==='error'?'bg-red-100 text-red-500':'bg-gray-100 text-gray-500'}`}> <i className={`fas ${modal.type==='error'?'fa-times':'fa-info'} text-2xl`}></i> </div> 
                            <h3 className="text-xl font-bold text-gray-800 mb-2">{modal.title}</h3> <p className="text-gray-600 text-sm">{modal.message}</p> 
                        </div> 
                        <div className="p-4 bg-gray-50"> <button onClick={closeModal} className="w-full py-2.5 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 transition">ตกลง</button> </div> 
                    </div> 
                </div> 
            )}
            {loading && <CampingAdminLoader text="กำลังตรวจสอบกุญแจ..." />}
        </div> 
    );

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <div className="no-print">
                <nav className="bg-white shadow p-3 sticky top-0 z-20 flex justify-between items-center">
                    <div className="font-bold text-lg text-green-800 flex items-center gap-2"><i className="fas fa-campground"></i> จัดการระบบ</div>
                    <div className="flex gap-2">
                        <button onClick={fetchData} className="w-8 h-8 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition"><i className="fas fa-sync"></i></button>
                        <button onClick={handleLogout} className="w-8 h-8 bg-red-50 rounded-full text-red-500 hover:bg-red-100 transition"><i className="fas fa-power-off"></i></button>
                    </div>
                </nav>
                <div className="max-w-7xl mx-auto p-3 md:p-6">
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                        <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab==='dashboard'?'bg-green-600 text-white shadow-lg transform scale-105':'bg-white text-gray-600 shadow hover:bg-gray-50'}`}><i className="fas fa-chart-line mr-1"></i> ภาพรวม</button>
                        <button onClick={() => setActiveTab('bookings')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab==='bookings'?'bg-green-600 text-white shadow-lg transform scale-105':'bg-white text-gray-600 shadow hover:bg-gray-50'}`}><i className="fas fa-list mr-1"></i> รายการจอง</button>
                        <button onClick={() => setActiveTab('calendar')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab==='calendar'?'bg-green-600 text-white shadow-lg transform scale-105':'bg-white text-gray-600 shadow hover:bg-gray-50'}`}><i className="fas fa-calendar-alt mr-1"></i> ปฏิทิน</button>
                        <button onClick={() => setActiveTab('rooms_map')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab==='rooms_map'?'bg-green-600 text-white shadow-lg transform scale-105':'bg-white text-gray-600 shadow hover:bg-gray-50'}`}><i className="fas fa-map-marked-alt mr-1"></i> ห้องพัก & แผนที่</button>
                        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab==='settings'?'bg-green-600 text-white shadow-lg transform scale-105':'bg-white text-gray-600 shadow hover:bg-gray-50'}`}><i className="fas fa-cogs mr-1"></i> ตั้งค่าระบบ</button>
                    </div>
                    
                    {activeTab === 'dashboard' && (
                        <div className="space-y-6 animate-pop">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-green-500"><div className="text-gray-500 text-xs mb-1">รายได้รวม (มัดจำ)</div><div className="text-2xl font-bold text-green-700">{formatMoney(stats.totalRevenue)} ฿</div></div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-blue-500"><div className="text-gray-500 text-xs mb-1">รายได้เดือนนี้</div><div className="text-2xl font-bold text-blue-700">{formatMoney(stats.monthlyRevenue)} ฿</div></div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-yellow-500"><div className="text-gray-500 text-xs mb-1">รอตรวจสอบ</div><div className="text-2xl font-bold text-yellow-600">{stats.pendingCount} รายการ</div></div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-gray-500"><div className="text-gray-500 text-xs mb-1">การจองทั้งหมด</div><div className="text-2xl font-bold text-gray-700">{bookings.length}</div></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-6 flex items-center gap-2"><i className="fas fa-chart-bar text-green-500"></i> ยอดจองรายเดือน (ปีนี้)</h3>
                                    <div className="flex gap-2 h-48 pb-2">
                                        {stats.monthlyCounts.map((count, i) => (
                                            <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                                                <div className="absolute mb-1 bottom-full opacity-0 group-hover:opacity-100 transition text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 pointer-events-none z-10 shadow-sm whitespace-nowrap">{count} รายการ</div>
                                                <div className="w-full bg-green-500 rounded-t hover:bg-green-600 transition-all duration-300 relative shadow-sm" style={{ height: `${count > 0 ? (count / (Math.max(...stats.monthlyCounts) || 1)) * 85 : 2}%` }}></div>
                                                <div className="text-[10px] text-gray-400 mt-2">{["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][i]}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><i className="fas fa-clock text-blue-500"></i> เข้าพักเร็วๆ นี้ (3 วัน)</h3>
                                    <div className="space-y-3 overflow-y-auto max-h-40 pr-2">
                                        {stats.upcoming.length === 0 && <p className="text-gray-400 text-sm text-center py-4">ไม่มีรายการเร็วๆ นี้</p>}
                                        {stats.upcoming.map(b => (
                                            <div key={b.id} onClick={()=>setViewBooking(b)} className="flex justify-between items-center p-3 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition">
                                                <div><div className="font-bold text-sm text-gray-800">{b.name}</div><div className="text-xs text-blue-600"><i className="fas fa-calendar-day mr-1"></i>{formatThaiDateGlobal(b.checkIn)}</div></div>
                                                <div className="text-xs bg-white px-2 py-1 rounded-lg border border-blue-200 text-blue-500 font-bold shadow-sm">{b.rooms.split(',')[0].substring(0, 10)}..</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bookings' && (
                        <div>
                            <div className="flex flex-col md:flex-row gap-4 mb-4 items-center justify-between">
                                <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-auto">
                                    {['all', 'pending', 'confirmed', 'upcoming', 'history'].map(f => (
                                        <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === f ? 'bg-gray-800 text-white shadow' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>{f === 'all' ? 'ทั้งหมด' : (f === 'pending' ? 'รอตรวจสอบ' : (f === 'confirmed' ? 'ยืนยันแล้ว' : (f === 'upcoming' ? 'เร็วๆ นี้' : 'ประวัติ')))}</button>
                                    ))}
                                </div>
                                <div className="relative w-full md:w-64">
                                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                    <input type="text" placeholder="ค้นหา (ID, ชื่อ, เบอร์, LINE)" className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button onClick={() => setShowAdminBooking(true)} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 shadow flex items-center justify-center gap-1 transition"><i className="fas fa-plus"></i> Walk-in</button>
                                    <button onClick={handleExport} className="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded-full text-xs font-bold hover:bg-green-700 shadow flex items-center justify-center gap-1 transition"><i className="fas fa-file-excel"></i> Excel</button>
                                    <button onClick={handlePrintReport} className="flex-1 md:flex-none px-4 py-2 bg-red-600 text-white rounded-full text-xs font-bold hover:bg-red-700 shadow flex items-center justify-center gap-1 transition"><i className="fas fa-print"></i> Report</button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {filteredBookings.length === 0 && <div className="text-center text-gray-400 py-10">ไม่พบข้อมูลการจอง</div>}
                                {filteredBookings.map(b => ( <BookingRow key={b.id} booking={b} onViewDetails={setViewBooking} onUpdateStatus={updateStatus} onViewSlip={setViewSlip} /> ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'calendar' && (
                        <div className="bg-white rounded-lg shadow p-4">
                            <div className="flex justify-between items-center mb-4">
                                <button onClick={()=>setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-2 bg-gray-100 rounded hover:bg-gray-200"><i className="fas fa-chevron-left"></i></button>
                                <h2 className="text-xl font-bold">{calendarDate.toLocaleString('th-TH', { month: 'long', year: 'numeric' })}</h2>
                                <button onClick={()=>setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-2 bg-gray-100 rounded hover:bg-gray-200"><i className="fas fa-chevron-right"></i></button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center text-xs md:text-sm font-bold bg-gray-200 p-2 rounded-t"><div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div></div>
                            <div className="grid grid-cols-7 gap-1 border-l border-b border-gray-200">
                                {days.map((day, idx) => {
                                    const dayBookings = getBookingsForDate(day);
                                    return (
                                        <div key={idx} className="border-t border-r border-gray-200 calendar-day p-1 relative">
                                            {day && <div className="text-right text-xs text-gray-500 mb-1">{day}</div>}
                                            {dayBookings.map(b => (<div key={b.id} onClick={(e)=>{ e.stopPropagation(); setViewBooking(b); }} className={`text-[10px] p-1 rounded mb-1 truncate cursor-pointer text-white ${b.status==='ยืนยัน'?'bg-green-500':'bg-yellow-500'}`}>{b.name}</div>))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'rooms_map' && (
                        <div className="animate-pop flex flex-col lg:flex-row gap-6 min-h-[600px] h-[calc(100vh-150px)]">
                            <div className="w-full lg:w-1/3 bg-white rounded-lg shadow-lg flex flex-col overflow-hidden">
                                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                                    <h2 className="font-bold text-gray-800">จัดการห้องพัก</h2>
                                    <div className="flex gap-2 flex-wrap justify-end">
                                        <label className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 shadow cursor-pointer flex items-center justify-center whitespace-nowrap">
                                            <i className="fas fa-map mr-1"></i> เปลี่ยนรูปแผนที่
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], base64 => setMapBackground(base64))} />
                                        </label>
                                        <button onClick={() => setEditingRoom({ id: 'R'+Date.now().toString().substr(-4), name: 'ห้องใหม่', type: 'room', min: 2, maxCap: 4, pricing: {tiers:[{max:2,price:1000}]}, bf: false, x: 50, y: 50, desc: '', images: [] })} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 shadow whitespace-nowrap">+ เพิ่มห้อง</button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                                    {editingRoom ? (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center mb-2"><span className="font-bold text-blue-600">กำลังแก้ไข: {editingRoom.name}</span><button onClick={()=>updateEditingRoomInList()} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">เสร็จสิ้น (ชั่วคราว)</button></div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div><label className="text-xs font-bold block">ID</label><input className="w-full border p-1 rounded text-sm bg-gray-100" value={editingRoom.id} readOnly /></div>
                                                <div><label className="text-xs font-bold block">ชื่อห้อง</label><input className="w-full border p-1 rounded text-sm" value={editingRoom.name} onChange={e=>setEditingRoom({...editingRoom, name: e.target.value})} /></div>
                                                <div><label className="text-xs font-bold block">ประเภท</label><select className="w-full border p-1 rounded text-sm" value={editingRoom.type} onChange={e=>setEditingRoom({...editingRoom, type: e.target.value})}><option value="room">บ้านพัก</option><option value="tent">เต็นท์กระโจม</option><option value="tent_rent">เช่าเต็นท์</option><option value="ground">ลานกางเต็นท์</option></select></div>
                                                <div><label className="text-xs font-bold block">อาหารเช้า</label><select className="w-full border p-1 rounded text-sm" value={editingRoom.bf} onChange={e=>setEditingRoom({...editingRoom, bf: e.target.value==='true'})}><option value="true">มี</option><option value="false">ไม่มี</option></select></div>
                                                <div><label className="text-xs font-bold block">Min คน</label><input type="number" className="w-full border p-1 rounded text-sm" value={editingRoom.min} onChange={e=>setEditingRoom({...editingRoom, min: parseInt(e.target.value)})} /></div>
                                                <div><label className="text-xs font-bold block">Max คน</label><input type="number" className="w-full border p-1 rounded text-sm" value={editingRoom.maxCap} onChange={e=>setEditingRoom({...editingRoom, maxCap: parseInt(e.target.value)})} /></div>
                                            </div>
                                            <div><label className="text-xs font-bold block">โครงสร้างราคา (JSON)</label><textarea className="w-full border p-1 rounded text-xs font-mono h-20" value={JSON.stringify(editingRoom.pricing || {}, null, 2)} onChange={e=>{ try { setEditingRoom({...editingRoom, pricing: JSON.parse(e.target.value)}) } catch(err){} }}></textarea><p className="text-[10px] text-gray-400">Ex: {"{\"tiers\":[{\"max\":2,\"price\":1200}]}"}</p></div>
                                            <div><label className="text-xs font-bold block">คำอธิบาย</label><textarea className="w-full border p-1 rounded text-sm h-16" value={editingRoom.desc} onChange={e=>setEditingRoom({...editingRoom, desc: e.target.value})}></textarea></div>
                                            <div><label className="text-xs font-bold block">รูปภาพ</label><div className="flex flex-wrap gap-2 mb-2">{(editingRoom.images || []).map((img, idx) => ( <div key={idx} className="relative w-12 h-12 group"><img src={img} className="w-full h-full object-cover rounded border" /><button onClick={()=>setEditingRoom({...editingRoom, images: editingRoom.images.filter((_,i)=>i!==idx)})} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] hidden group-hover:flex">x</button></div> ))}</div><input type="file" multiple className="text-[10px]" onChange={e => handleMultipleImageUpload(e.target.files, base64List => setEditingRoom({...editingRoom, images: [...(editingRoom.images||[]), ...base64List]}))} /></div>
                                            <div className="flex gap-2 items-center"><div className="flex-1"><label className="text-[10px] font-bold text-gray-500">Pos X</label><input type="number" className="w-full border p-1 rounded text-xs bg-gray-50" value={editingRoom.x} onChange={e=>setEditingRoom({...editingRoom, x: Number(e.target.value)})} /></div><div className="flex-1"><label className="text-[10px] font-bold text-gray-500">Pos Y</label><input type="number" className="w-full border p-1 rounded text-xs bg-gray-50" value={editingRoom.y} onChange={e=>setEditingRoom({...editingRoom, y: Number(e.target.value)})} /></div></div>
                                            <div className="pt-2 border-t flex justify-between"><button onClick={()=>{ confirmMsg('ยืนยันการลบห้องพักนี้?', () => { setRoomsMapData(roomsMapData.filter(r=>r.id!==editingRoom.id)); setEditingRoom(null); }); }} className="text-red-500 text-xs underline">ลบห้องพัก</button></div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">{roomsMapData.map(r => ( <div key={r.id} onClick={()=>setEditingRoom(r)} className="p-3 border rounded hover:bg-blue-50 cursor-pointer flex justify-between items-center transition"><div><div className="font-bold text-sm text-gray-800">{r.name}</div><div className="text-xs text-gray-500">{r.id} • {r.type}</div></div><i className="fas fa-chevron-right text-gray-300"></i></div> ))}</div>
                                    )}
                                </div>
                                <div className="p-4 bg-gray-100 border-t"><button onClick={saveRoomChanges} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded font-bold shadow hover:bg-blue-700 disabled:bg-gray-400">บันทึกการเปลี่ยนแปลงทั้งหมด</button></div>
                            </div>
                            <div className="w-full lg:w-2/3 bg-gray-200 rounded-lg shadow-inner overflow-auto flex items-center justify-center p-4">
                                <div className="relative inline-block" onClick={handleMapClick}>
                                    <img src={mapBackground} className="max-w-full max-h-[calc(100vh-200px)] object-contain block pointer-events-none select-none shadow-lg rounded" />
                                    {!editingRoom && roomsMapData.map(r => ( <div key={r.id} className="map-pin" style={{ left: `${r.x}%`, top: `${r.y}%` }} onClick={(e)=>{ e.stopPropagation(); setEditingRoom(r); }}>{r.id}</div> ))}
                                    {editingRoom && ( <div className="map-pin active shadow-xl border-4 border-yellow-400" style={{ left: `${editingRoom.x}%`, top: `${editingRoom.y}%` }}>{editingRoom.id}</div> )}
                                    {editingRoom && <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm pointer-events-none">📍 คลิกบนแผนที่เพื่อย้ายตำแหน่ง <b>{editingRoom.name}</b></div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-8 animate-pop">
                            {siteSettings && (
                                <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                                    <div className="flex justify-between items-center mb-6 border-b pb-4"><h2 className="text-xl font-bold text-gray-800"><i className="fas fa-store mr-2"></i>ตั้งค่าหน้าร้าน (Store Config)</h2><button onClick={handleSaveSiteSettings} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:bg-gray-400"> บันทึกข้อมูลร้าน </button></div>
                                    <div className="mb-8">
                                        <h3 className="font-bold text-lg mb-4 text-blue-600">ข้อมูลทั่วไป</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            <div className="border p-4 rounded-xl bg-gray-50"><label className="block text-sm font-bold mb-3 text-gray-700">โลโก้ร้าน (Logo)</label><div className="flex items-center gap-4"><div className="w-24 h-24 bg-white border-2 border-dashed border-gray-300 rounded-full overflow-hidden relative group shadow-sm flex-shrink-0">{siteSettings.logoUrl ? ( <img src={siteSettings.logoUrl} className="w-full h-full object-cover" /> ) : ( <div className="w-full h-full flex items-center justify-center text-gray-400"><i className="fas fa-store text-2xl"></i></div> )}<label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition duration-200"><i className="fas fa-camera mb-1"></i><span className="text-[10px]">เปลี่ยนรูป</span><input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], base64 => setSiteSettings({...siteSettings, logoUrl: base64}))} /></label></div><div className="flex-1"><p className="text-xs text-gray-500 mb-2">แนะนำรูปสี่เหลี่ยมจัตุรัส (1:1)</p>{siteSettings.logoUrl && <button onClick={() => setSiteSettings({...siteSettings, logoUrl: ''})} className="text-xs text-red-500 hover:text-red-700 border border-red-200 bg-white px-2 py-1 rounded transition">ลบรูปภาพ</button>}</div></div></div>
                                            <div className="border p-4 rounded-xl bg-gray-50"><label className="block text-sm font-bold mb-3 text-gray-700">ภาพปก (Banner)</label><div className="w-full h-24 bg-white border-2 border-dashed border-gray-300 rounded-lg overflow-hidden relative group shadow-sm">{siteSettings.bannerUrl ? ( <img src={siteSettings.bannerUrl} className="w-full h-full object-cover" /> ) : ( <div className="w-full h-full flex items-center justify-center text-gray-400"><i className="fas fa-image text-2xl"></i></div> )}<label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition duration-200"><i className="fas fa-cloud-upload-alt mb-1"></i><span className="text-xs">อัพโหลดภาพปก</span><input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], base64 => setSiteSettings({...siteSettings, bannerUrl: base64}))} /></label></div><div className="flex justify-between items-center mt-2"><p className="text-xs text-gray-500">แนะนำรูปแนวนอน (16:9)</p>{siteSettings.bannerUrl && <button onClick={() => setSiteSettings({...siteSettings, bannerUrl: ''})} className="text-xs text-red-500 hover:text-red-700">ลบรูปภาพ</button>}</div></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"><div><label className="block text-sm font-bold mb-1">ชื่อร้าน (Title)</label><input className="w-full border p-2 rounded" value={siteSettings.headerTitle} onChange={e => setSiteSettings({...siteSettings, headerTitle: e.target.value})} /></div><div><label className="block text-sm font-bold mb-1">คำอธิบายร้าน (Description)</label><textarea className="w-full border p-2 rounded" rows="3" value={siteSettings.headerDesc} onChange={e => setSiteSettings({...siteSettings, headerDesc: e.target.value})}></textarea></div></div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg text-blue-600">เมนูอาหาร</h3><button onClick={() => { const newFood = { id: 'F'+Date.now(), name: 'เมนูใหม่', price: 0, img: '', desc: '' }; setSiteSettings({...siteSettings, foodMenu: [...siteSettings.foodMenu, newFood]}); }} className="bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-200">+ เพิ่มเมนู</button></div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{siteSettings.foodMenu.map((food, idx) => ( <div key={food.id} className="border p-3 rounded flex gap-3 bg-white items-start"><div className="w-16 h-16 bg-gray-200 rounded flex-shrink-0 relative overflow-hidden group">{food.img ? <img src={food.img} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-gray-400 text-xs">No Img</div>}<input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e.target.files[0], base64 => { const newFoods = [...siteSettings.foodMenu]; newFoods[idx].img = base64; setSiteSettings({...siteSettings, foodMenu: newFoods}); })} /></div><div className="flex-1 space-y-1"><input className="w-full border p-1 rounded text-sm" placeholder="ชื่อเมนู" value={food.name} onChange={e => { const newFoods = [...siteSettings.foodMenu]; newFoods[idx].name = e.target.value; setSiteSettings({...siteSettings, foodMenu: newFoods}); }} /><textarea className="w-full border p-1 rounded text-xs resize-none" rows="2" placeholder="คำอธิบายอาหาร..." value={food.desc || ''} onChange={e => { const newFoods = [...siteSettings.foodMenu]; newFoods[idx].desc = e.target.value; setSiteSettings({...siteSettings, foodMenu: newFoods}); }}></textarea><div className="flex items-center gap-2"><input type="number" className="w-20 border p-1 rounded text-sm" placeholder="ราคา" value={food.price} onChange={e => { const newFoods = [...siteSettings.foodMenu]; newFoods[idx].price = parseInt(e.target.value) || 0; setSiteSettings({...siteSettings, foodMenu: newFoods}); }} /><span className="text-sm text-gray-500">บาท</span></div></div><button onClick={() => { const newFoods = siteSettings.foodMenu.filter((_, i) => i !== idx); setSiteSettings({...siteSettings, foodMenu: newFoods}); }} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button></div> ))}</div>
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500"><h3 className="font-bold text-lg mb-4 text-green-800"><i className="fas fa-tags"></i> โค้ดส่วนลด</h3><div className="flex gap-2 mb-4 flex-wrap items-end bg-gray-50 p-2 rounded"><div><label className="text-xs text-gray-500">Code</label><input className="border p-2 rounded text-sm w-24 block" value={formDiscount.code} onChange={e=>setFormDiscount({...formDiscount, code:e.target.value})} /></div><div><label className="text-xs text-gray-500">Type</label><select className="border p-2 rounded text-sm block" value={formDiscount.type} onChange={e=>setFormDiscount({...formDiscount, type:e.target.value})}><option value="FIXED">บาท</option><option value="PERCENT">%</option></select></div><div><label className="text-xs text-gray-500">Value</label><input type="number" className="border p-2 rounded text-sm w-20 block" value={formDiscount.value} onChange={e=>setFormDiscount({...formDiscount, value:e.target.value})} /></div><button onClick={()=>handleSaveSetting('discount', formDiscount)} className={`px-3 py-2 rounded text-sm text-white ${editMode?.code===formDiscount.code ? 'bg-orange-500':'bg-green-600'}`}>{editMode?.code===formDiscount.code ? 'บันทึกแก้ไข':'เพิ่ม'}</button>{editMode && <button onClick={()=>{setEditMode(null); setFormDiscount({code:'',type:'FIXED',value:''})}} className="text-gray-500 text-sm">ยกเลิก</button>}</div><ul className="divide-y max-h-40 overflow-y-auto">{settings.discounts.map((d, i) => ( <li key={i} className="flex justify-between items-center p-2 text-sm"><span><b>{d.code}</b> : ลด {d.value} {d.type}</span><div className="flex gap-2"><button onClick={()=>startEdit('discount', d)} className="text-blue-500"><i className="fas fa-edit"></i></button><button onClick={()=>handleDeleteSetting('discount', d.id)} className="text-red-500"><i className="fas fa-trash"></i></button></div></li> ))}</ul></div>
                                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500"><h3 className="font-bold text-lg mb-4 text-red-800"><i className="fas fa-calendar-times"></i> วันปิดบริการ (ทั้งรีสอร์ท)</h3><div className="flex gap-2 mb-4 flex-wrap items-end bg-gray-50 p-2 rounded"><div><label className="text-xs text-gray-500 block">เริ่ม</label><input type="date" className="border p-2 rounded text-sm" value={formClosed.startDate} onChange={e=>setFormClosed({...formClosed, startDate:e.target.value})} /></div><div><label className="text-xs text-gray-500 block">สิ้นสุด</label><input type="date" className="border p-2 rounded text-sm" value={formClosed.endDate} onChange={e=>setFormClosed({...formClosed, endDate:e.target.value})} /></div><div className="flex-1"><label className="text-xs text-gray-500 block">เหตุผล</label><input placeholder="เหตุผล" className="border p-2 rounded text-sm w-full" value={formClosed.reason} onChange={e=>setFormClosed({...formClosed, reason:e.target.value})} /></div><button onClick={()=>handleSaveSetting('closed', formClosed)} className="px-3 py-2 rounded text-sm text-white bg-red-600 mb-0.5">ปิด</button></div><ul className="divide-y max-h-40 overflow-y-auto">{settings.closed.map((c, i) => ( <li key={i} className="flex justify-between items-center p-2 text-sm text-red-800"><span>{formatThaiDateGlobal(c.date)} ({c.reason})</span><button onClick={()=>handleDeleteSetting('closed', c.id)} className="text-red-500"><i className="fas fa-trash"></i></button></li> ))}</ul></div>
                                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-500"><h3 className="font-bold text-lg mb-4 text-gray-800"><i className="fas fa-ban"></i> ปิดปรับปรุงห้องพัก (รายห้อง)</h3><div className="flex gap-2 mb-4 flex-wrap items-end bg-gray-50 p-2 rounded"><div><label className="text-xs text-gray-500 block">เริ่ม</label><input type="date" className="border p-2 rounded text-sm" value={formRoomClosure.startDate} onChange={e=>setFormRoomClosure({...formRoomClosure, startDate:e.target.value})} /></div><div><label className="text-xs text-gray-500 block">สิ้นสุด</label><input type="date" className="border p-2 rounded text-sm" value={formRoomClosure.endDate} onChange={e=>setFormRoomClosure({...formRoomClosure, endDate:e.target.value})} /></div><div><label className="text-xs text-gray-500 block">ห้อง</label><select className="border p-2 rounded text-sm" value={formRoomClosure.roomId} onChange={e=>setFormRoomClosure({...formRoomClosure, roomId:e.target.value})}>{ROOM_IDS.map(r => <option key={r} value={r}>{ROOM_NAMES[r]}</option>)}</select></div><div className="flex-1"><label className="text-xs text-gray-500 block">สาเหตุ</label><input placeholder="สาเหตุ" className="border p-2 rounded text-sm w-full" value={formRoomClosure.reason} onChange={e=>setFormRoomClosure({...formRoomClosure, reason:e.target.value})} /></div><button onClick={()=>handleSaveSetting('room_closure', formRoomClosure)} className="px-3 py-2 rounded text-sm text-white bg-gray-600 mb-0.5">ปิด</button></div><ul className="divide-y max-h-40 overflow-y-auto">{(settings.roomClosures || []).map((rc, i) => ( <li key={i} className="flex justify-between items-center p-2 text-sm text-gray-700"><span>{formatThaiDateGlobal(rc.date)} : <b>{ROOM_NAMES[rc.roomId] || rc.roomId}</b> ({rc.reason})</span><button onClick={()=>handleDeleteSetting('room_closure', rc.id)} className="text-red-500"><i className="fas fa-trash"></i></button></li> ))}</ul></div>
                                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-800"><h3 className="font-bold text-lg mb-4 text-blue-800"><i className="fas fa-star"></i> วันพิเศษ (มัดจำ 100%)</h3><div className="flex gap-2 mb-4 flex-wrap items-end bg-gray-50 p-2 rounded"><div><label className="text-xs text-gray-500 block">เริ่ม</label><input type="date" className="border p-2 rounded text-sm" value={formSpecial.startDate} onChange={e=>setFormSpecial({...formSpecial, startDate:e.target.value})} /></div><div><label className="text-xs text-gray-500 block">สิ้นสุด</label><input type="date" className="border p-2 rounded text-sm" value={formSpecial.endDate} onChange={e=>setFormSpecial({...formSpecial, endDate:e.target.value})} /></div><div className="flex-1"><label className="text-xs text-gray-500 block">รายละเอียด</label><input placeholder="รายละเอียด" className="border p-2 rounded text-sm w-full" value={formSpecial.desc} onChange={e=>setFormSpecial({...formSpecial, desc:e.target.value})} /></div><button onClick={()=>handleSaveSetting('special', formSpecial)} className={`px-3 py-2 rounded text-sm text-white ${editMode?.desc===formSpecial.desc ? 'bg-orange-500':'bg-blue-600'} mb-0.5`}>{editMode?'บันทึก':'เพิ่ม'}</button></div><ul className="divide-y max-h-40 overflow-y-auto">{settings.special.map((s, i) => ( <li key={i} className="flex justify-between items-center p-2 text-sm text-blue-800"><span>{formatThaiDateGlobal(s.date)} ({s.desc})</span><div className="flex gap-2"><button onClick={()=>startEdit('special', s)} className="text-blue-500"><i className="fas fa-edit"></i></button><button onClick={()=>handleDeleteSetting('special', s.id)} className="text-red-500"><i className="fas fa-trash"></i></button></div></li> ))}</ul></div>
                            </div>
                        </div>
                    )}
                </div>

                {showAdminBooking && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-pop">
                            <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-blue-800 flex items-center"><i className="fas fa-user-edit mr-2"></i> สร้างรายการจอง (Walk-in)</h3>
                                <button onClick={() => setShowAdminBooking(false)} className="text-gray-400 hover:text-red-500 transition"><i className="fas fa-times text-xl"></i></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">ชื่อลูกค้า</label><input type="text" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={adminBookingForm.name} onChange={e=>setAdminBookingForm({...adminBookingForm, name: e.target.value})} placeholder="ระบุชื่อ" /></div>
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">เบอร์โทร</label><input type="text" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={adminBookingForm.phone} onChange={e=>setAdminBookingForm({...adminBookingForm, phone: e.target.value})} placeholder="ระบุเบอร์โทร" /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">เช็คอิน</label><input type="date" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={adminBookingForm.checkIn} onChange={e=>setAdminBookingForm({...adminBookingForm, checkIn: e.target.value})} /></div>
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">เช็คเอาท์</label><input type="date" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={adminBookingForm.checkOut} min={adminBookingForm.checkIn} onChange={e=>setAdminBookingForm({...adminBookingForm, checkOut: e.target.value})} /></div>
                                </div>

                                {adminBookingForm.checkIn && adminBookingForm.checkOut && adminAvailability ? (
                                    <div className="border p-4 rounded-xl bg-blue-50/50">
                                        <label className="text-sm font-bold text-blue-800 block mb-3"><i className="fas fa-bed mr-1"></i> เลือกห้องพัก</label>
                                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                            {Object.values(roomConfig).map(r => {
                                                const isBooked = adminAvailability.bookedRooms.includes(r.id);
                                                const isZ8Full = r.id === 'Z8' && adminAvailability.zone8Available <= 0;
                                                const disabled = isBooked || isZ8Full;
                                                const selectedRoom = adminBookingForm.rooms.find(room => room.id === r.id);
                                                const isSelected = !!selectedRoom;
                                                
                                                return (
                                                    <div key={r.id} className={`flex flex-col gap-2 p-3 border rounded-lg transition shadow-sm ${disabled ? 'bg-gray-100 opacity-50' : (isSelected ? 'bg-blue-50 border-blue-500' : 'bg-white hover:bg-gray-50')}`}>
                                                        <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                                            <input type="checkbox" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" disabled={disabled} checked={isSelected}
                                                                onChange={(e) => {
                                                                    let newRooms;
                                                                    if (e.target.checked) {
                                                                        newRooms = [...adminBookingForm.rooms, { id: r.id, guests: r.min || 2 }];
                                                                    } else {
                                                                        newRooms = adminBookingForm.rooms.filter(room => room.id !== r.id);
                                                                    }
                                                                    setAdminBookingForm({...adminBookingForm, rooms: newRooms});
                                                                }}
                                                            />
                                                            <span className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>
                                                                {r.name}
                                                                {r.id === 'Z8' ? <span className="text-[10px] text-green-600 block mt-0.5">(ว่าง {adminAvailability.zone8Available} คน)</span> : ''}
                                                            </span>
                                                        </label>
                                                        
                                                        {isSelected && (
                                                            <div className="flex items-center justify-between mt-1 pl-6 pt-2 border-t border-blue-200">
                                                                <span className="text-[10px] font-bold text-gray-500">ผู้เข้าพัก:</span>
                                                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-200">
                                                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAdminRoomGuests(r.id, -1); }} className="w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-bold transition text-xs">-</button>
                                                                    <span className="text-xs font-bold w-4 text-center text-blue-800">{selectedRoom.guests}</span>
                                                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAdminRoomGuests(r.id, 1); }} className="w-5 h-5 flex items-center justify-center bg-blue-100 hover:bg-blue-200 rounded text-blue-600 font-bold transition text-xs">+</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    adminBookingForm.checkIn && adminBookingForm.checkOut && <div className="text-sm text-center text-blue-600 py-6 bg-blue-50 rounded-xl"><i className="fas fa-circle-notch fa-spin mr-2"></i> กำลังโหลดห้องว่าง...</div>
                                )}

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">ยอดสุทธิรวม (บาท)</label><input type="number" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-green-50 text-green-800 font-bold" value={adminBookingForm.price} onChange={e=>setAdminBookingForm({...adminBookingForm, price: e.target.value})} placeholder="ระบุยอดรวมทั้งหมด" /></div>
                                    <div><label className="text-xs font-bold text-gray-600 block mb-1">มัดจำที่รับมาแล้ว (บาท)</label><input type="number" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-yellow-50 text-yellow-800 font-bold" value={adminBookingForm.deposit} onChange={e=>setAdminBookingForm({...adminBookingForm, deposit: e.target.value})} placeholder="ระบุยอดมัดจำ" /></div>
                                </div>
                            </div>
                            <div className="p-4 border-t bg-gray-50 flex gap-3">
                                <button onClick={() => setShowAdminBooking(false)} className="flex-1 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition shadow-sm">ยกเลิก</button>
                                <button onClick={handleCreateAdminBooking} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"><i className="fas fa-check"></i> สร้างรายการ</button>
                            </div>
                        </div>
                    </div>
                )}
                
                {modal.isOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 animate-pop">
                            <div className={`p-6 text-center ${modal.type==='error' ? 'bg-red-50' : modal.type==='success' ? 'bg-green-50' : modal.type==='warning' ? 'bg-orange-50' : 'bg-white'}`}>
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm ${modal.type==='confirm' ? 'bg-blue-100 text-blue-600' : modal.type==='success' ? 'bg-green-100 text-green-600' : modal.type==='error' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                    <i className={`fas ${modal.type==='confirm' ? 'fa-question' : modal.type==='success' ? 'fa-check' : modal.type==='error' ? 'fa-times' : 'fa-exclamation'} text-3xl`}></i>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">{modal.title}</h3>
                                <p className="text-gray-600 text-sm leading-relaxed">{modal.message}</p>
                            </div>
                            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
                                {modal.type === 'confirm' && ( <button onClick={closeModal} className="flex-1 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition shadow-sm">ยกเลิก</button> )}
                                <button onClick={modal.onConfirm} className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 ${modal.type==='error' ? 'bg-red-500 hover:bg-red-600' : modal.type==='success' ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-800 hover:bg-gray-900'}`}> {modal.type === 'confirm' ? 'ยืนยัน' : 'ตกลง'} </button>
                            </div>
                        </div>
                    </div>
                )}
                {viewSlip && (
                    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-md" onClick={() => setViewSlip(null)}>
                        <div className="relative max-w-full">
                            <button className="absolute -top-12 right-0 text-white text-3xl bg-white/20 w-10 h-10 rounded-full hover:bg-white/40 flex items-center justify-center transition"><i className="fas fa-times"></i></button>
                            <img src={viewSlip} className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
                            <div className="text-center mt-6">
                                <a href={viewSlip} target="_blank" className="inline-block px-6 py-2 bg-white text-gray-900 rounded-full text-sm font-bold hover:bg-gray-200 transition shadow-lg no-underline"><i className="fas fa-external-link-alt mr-2"></i> เปิดรูปเต็ม</a>
                            </div>
                        </div>
                    </div>
                )}
                {viewBooking && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => { setViewBooking(null); setRescheduleData(null); }}>
                        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-pop max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                                <h3 className="font-bold text-lg text-gray-800">รายละเอียดการจอง</h3>
                                <button onClick={() => { setViewBooking(null); setRescheduleData(null); }} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-start mb-4">
                                    <div><div className="font-bold text-xl text-green-800">{viewBooking.name}</div><div className="text-xs text-gray-400">{viewBooking.id}</div></div>
                                    <StatusBadge status={viewBooking.status} />
                                </div>
                                <div className="space-y-3 text-sm text-gray-600 bg-white rounded-lg">
                                    <div className="flex gap-2 items-center"><i className="fas fa-phone w-5 text-center text-blue-500"></i> {viewBooking.phone}</div>
                                    <div className="flex gap-2 items-center"><i className="fab fa-line w-5 text-center text-green-500"></i> {viewBooking.lineProfile}</div>
                                    <hr className="border-dashed border-gray-300"/>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><span className="text-xs text-gray-400 block">เช็คอิน</span><b className="text-gray-800">{formatThaiDateGlobal(viewBooking.checkIn)}</b></div>
                                        <div><span className="text-xs text-gray-400 block">เช็คเอาท์</span><b className="text-gray-800">{formatThaiDateGlobal(viewBooking.checkOut)}</b></div>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                        <p className="font-bold text-green-800 mb-1"><i className="fas fa-bed mr-1"></i> ห้องพัก</p>
                                        {(() => {
                                            let cart = safeJsonParse(viewBooking.cart, []);
                                            const rooms = cart.filter(c => c.type !== 'food');
                                            return rooms.map((r, i) => (
                                                <div key={i} className="flex justify-between text-sm text-green-900 mb-1">
                                                    <span>- {r.name}</span>
                                                    <span className="text-gray-600">จำนวน {r.guests} ท่าน</span>
                                                </div>
                                            ));
                                        })()}
                                        {viewBooking.food !== '-' && ( <div className="mt-2 pt-2 border-t border-green-200"><p className="font-bold text-orange-600 mb-1"><i className="fas fa-utensils mr-1"></i> อาหาร</p><p>{viewBooking.food}</p></div> )}
                                    </div>
                                    <div className="flex justify-between items-center pt-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        <div className="text-center w-1/3"><div className="text-[10px] text-gray-500">ยอดสุทธิ</div><div className="font-bold text-gray-800">{formatMoney(viewBooking.price)}</div></div>
                                        <div className="h-8 w-px bg-blue-200"></div>
                                        <div className="text-center w-1/3"><div className="text-[10px] text-gray-500">มัดจำ</div><div className="font-bold text-red-600">{formatMoney(viewBooking.deposit)}</div></div>
                                        <div className="h-8 w-px bg-blue-200"></div>
                                        <div className="text-center w-1/3"><div className="text-[10px] text-gray-500">คงเหลือ</div><div className="font-bold text-green-600">{formatMoney(Number(viewBooking.price || 0) - Number(viewBooking.deposit || 0))}</div></div>
                                    </div>
                                </div>

                                <div className="mt-6 border-t pt-4">
                                    <h4 className="font-bold text-sm text-blue-700 flex items-center mb-3"><i className="fas fa-plus-circle mr-2"></i> เพิ่มบริการ/อาหาร (แอดมิน)</h4>
                                    <div className="space-y-2 mb-3">
                                        <input type="text" placeholder="ชื่อรายการ (เช่น กะเพราหมู, รถรับส่ง)" className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none" value={customAddonName} onChange={e => setCustomAddonName(e.target.value)} />
                                        <div className="flex gap-2">
                                            <input type="number" placeholder="ราคา/หน่วย" className="border p-2 rounded-lg text-sm w-1/3 bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none" value={customAddonPrice} onChange={e => setCustomAddonPrice(e.target.value)} />
                                            <input type="number" placeholder="จำนวน" className="border p-2 rounded-lg text-sm w-1/4 bg-gray-50 text-center focus:ring-2 focus:ring-blue-200 focus:outline-none" min="1" value={addonQty} onChange={e => setAddonQty(e.target.value)} />
                                            <select className="border p-2 rounded-lg text-sm flex-1 bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none font-bold" value={addonStatus} onChange={e => setAddonStatus(e.target.value)}>
                                                <option value="unpaid" className="text-red-600">ยังไม่จ่าย</option>
                                                <option value="paid" className="text-green-600">จ่ายแล้ว</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={handleAdminAddService} className="w-full py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold shadow transition mt-1"><i className="fas fa-save mr-1"></i> บันทึกเพิ่มรายการ</button>
                                </div>

                                <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                                    {!rescheduleData ? (
                                        <button onClick={() => setRescheduleData({ id: viewBooking.id, checkIn: '', checkOut: '' })} className="w-full py-2.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-100 font-bold transition text-sm"><i className="fas fa-calendar-alt mr-1"></i> เลื่อนวันเข้าพัก</button>
                                    ) : (
                                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                                            <h4 className="font-bold text-orange-800 mb-3 text-sm flex items-center"><i className="fas fa-calendar-check mr-2"></i> เลือกวันเข้าพักใหม่</h4>
                                            <div className="space-y-3 mb-3">
                                                <div><label className="text-xs text-orange-700 block mb-1">เช็คอิน</label><input type="date" className="w-full border p-2 rounded-lg text-sm" onChange={e => setRescheduleData({...rescheduleData, checkIn: e.target.value})} /></div>
                                                <div><label className="text-xs text-orange-700 block mb-1">เช็คเอาท์</label><input type="date" className="w-full border p-2 rounded-lg text-sm" onChange={e => setRescheduleData({...rescheduleData, checkOut: e.target.value})} /></div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => setRescheduleData(null)} className="flex-1 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50">ยกเลิก</button>
                                                <button onClick={handleReschedule} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 shadow">ยืนยันการเลื่อน</button>
                                            </div>
                                        </div>
                                    )}
                                    {String(viewBooking.slip || '').includes('http') && <button onClick={() => setViewSlip(viewBooking.slip)} className="w-full py-2.5 bg-white border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-50 text-sm font-bold transition"><i className="fas fa-file-invoice-dollar mr-1"></i> ดูสลิปโอนเงิน</button>}
                                    <button onClick={handlePrintReceipt} className="w-full py-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-100 text-sm font-bold transition mt-2"><i className="fas fa-print mr-1"></i> พิมพ์ใบเสร็จ</button>
                                    
                                    <button onClick={handlePrintOfficialReceipt} className="w-full py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-xl hover:bg-indigo-100 text-sm font-bold transition mt-2"><i className="fas fa-file-invoice mr-1"></i> พิมพ์ใบเสร็จทางการ</button>
                                    
                                    <button onClick={handleSendReceipt} className="w-full py-2.5 bg-green-50 border border-green-200 text-green-600 rounded-xl hover:bg-green-100 text-sm font-bold transition mt-2"><i className="fab fa-line mr-1"></i> ส่งใบเสร็จให้ลูกค้า (LINE)</button>
                                    
                                    {viewBooking.status !== 'ยกเลิก' && ( <button onClick={() => updateStatus(viewBooking.id, 'ยกเลิก')} className="w-full py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 text-sm font-bold transition mt-2"><i className="fas fa-trash-alt mr-1"></i> ยกเลิกรายการจอง</button> )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div id="print-container">
                <div id="report-print-area">
                    <div className="flex justify-between items-center mb-4 border-b-2 border-gray-800 pb-2">
                        <div className="flex items-center gap-3">
                            {siteSettings && siteSettings.logoUrl && <img src={siteSettings.logoUrl} className="w-16 h-16 object-cover rounded-full" alt="logo" />}
                            <div><h1 className="text-xl font-bold">{siteSettings && siteSettings.headerTitle}</h1><p className="text-xs text-gray-600">รายงานการจองห้องพัก (Booking Report)</p></div>
                        </div>
                        <div className="text-right text-xs"><p>วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')}</p><p>ผู้พิมพ์: Admin</p></div>
                    </div>
                    <table className="w-full text-xs text-left border-collapse border border-gray-300">
                        <thead className="bg-gray-800 text-white">
                            <tr><th className="px-2 py-2 border border-gray-400 w-24">ID</th><th className="px-2 py-2 border border-gray-400">ลูกค้า</th><th className="px-2 py-2 border border-gray-400 w-24">เบอร์โทร</th><th className="px-2 py-2 border border-gray-400 w-20">เข้าพัก</th><th className="px-2 py-2 border border-gray-400 w-20">ออก</th><th className="px-2 py-2 border border-gray-400">รายละเอียด (ห้อง/อาหาร)</th><th className="px-2 py-2 border border-gray-400 text-right w-20">ยอดสุทธิ</th><th className="px-2 py-2 border border-gray-400 text-right w-20">มัดจำ</th><th className="px-2 py-2 border border-gray-400 text-center w-20">สถานะ</th></tr>
                        </thead>
                        <tbody>
                            {filteredBookings.map(b => (
                                <tr key={b.id} className="border-b border-gray-300 even:bg-gray-50 align-top">
                                    <td className="px-2 py-2 border border-gray-300 font-mono">{b.id}</td><td className="px-2 py-2 border border-gray-300">{b.name}</td><td className="px-2 py-2 border border-gray-300">{b.phone}</td><td className="px-2 py-2 border border-gray-300">{formatThaiDateGlobal(b.checkIn)}</td><td className="px-2 py-2 border border-gray-300">{formatThaiDateGlobal(b.checkOut)}</td>
                                    <td className="px-2 py-2 border border-gray-300 text-[10px]"><div className="font-semibold text-green-900 whitespace-pre-wrap">{b.rooms}</div>{b.food && b.food !== '-' && ( <div className="text-orange-800 border-t border-gray-200 mt-1 pt-1 whitespace-pre-wrap"><i className="fas fa-utensils mr-1 text-[8px]"></i>{b.food}</div> )}</td>
                                    <td className="px-2 py-2 border border-gray-300 text-right">{formatMoney(b.price)}</td><td className="px-2 py-2 border border-gray-300 text-right">{formatMoney(b.deposit)}</td><td className="px-2 py-2 border border-gray-300 text-center"><span className="border px-1 rounded text-[10px] bg-white">{b.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {viewBooking && (
                    <div id="receipt-print-area">
                        <div className="flex justify-between items-start mb-6 border-b-2 border-gray-800 pb-4">
                            <div className="flex gap-4 items-center">
                                <div className="w-24 h-24 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                                    {siteSettings && siteSettings.logoUrl ? ( <img src={siteSettings.logoUrl} className="w-full h-full object-contain" alt="Logo" onError={(e) => e.target.style.display = 'none'} /> ) : <span className="text-gray-400 text-xs">NO LOGO</span>}
                                </div>
                                <div><h1 className="text-2xl font-bold text-green-900">{siteSettings && siteSettings.headerTitle}</h1><p className="text-sm text-gray-600">หมู่ที่ 3 ต.ฉลุง อ.หาดใหญ่ จ.สงขลา 90110</p><p className="text-sm font-bold mt-2 text-black"><i className="fas fa-phone-alt mr-1"></i> โทร: {SHOP_PHONE} (พร้อมเพย์)</p></div>
                            </div>
                            <div className="text-right"><h2 className="text-3xl font-bold text-gray-800 uppercase tracking-widest">RECEIPT</h2><p className="text-sm text-gray-500">ใบเสร็จรับเงิน</p><div className="mt-4 text-sm"><p><b>เลขที่:</b> {viewBooking.id}</p><p><b>วันที่:</b> {new Date().toLocaleDateString('th-TH')}</p></div></div>
                        </div>
                        
                        <div className="flex w-full justify-between mb-6 bg-gray-50 p-4 rounded border border-gray-200">
                            <div className="flex-1 pr-4 border-r border-gray-200"><h3 className="font-bold text-gray-700 mb-2 border-b pb-1">ลูกค้า (Customer)</h3><p className="text-sm mb-1"><b>ชื่อ:</b> {viewBooking.name}</p><p className="text-sm mb-1"><b>เบอร์โทร:</b> {viewBooking.phone}</p><p className="text-sm"><b>LINE ID:</b> {viewBooking.lineProfile}</p></div>
                            <div className="flex-1 pl-4 text-right"><h3 className="font-bold text-gray-700 mb-2 border-b pb-1">รายละเอียดการเข้าพัก</h3><p className="text-sm mb-1"><b>เช็คอิน:</b> {formatThaiDateGlobal(viewBooking.checkIn)}</p><p className="text-sm mb-1"><b>เช็คเอาท์:</b> {formatThaiDateGlobal(viewBooking.checkOut)}</p><p className="text-sm"><b>จำนวน:</b> {viewBooking.totalGuests} ท่าน</p></div>
                        </div>

                        <table className="w-full mb-4 border-collapse">
                            <thead><tr className="bg-gray-800 text-white text-sm"><th className="py-2 px-3 text-left rounded-tl w-12">#</th><th className="py-2 px-3 text-left">รายการ (Description)</th><th className="py-2 px-3 text-right w-24">จำนวน</th><th className="py-2 px-3 text-right w-32 rounded-tr">จำนวนเงิน</th></tr></thead>
                            <tbody className="text-sm">
                                {(() => {
                                    const cart = safeJsonParse(viewBooking.cart, []);
                                    const roomItems = cart.filter(c => c.type !== 'food'); const foodItems = cart.filter(c => c.type === 'food');
                                    return ( <>
                                        {roomItems.length > 0 && ( <tr className="bg-gray-100 font-bold"><td colSpan="4" className="py-1 px-3 text-xs text-gray-600">ค่าที่พัก (Accommodation)</td></tr> )}
                                        {roomItems.map((item, idx) => { const price = (item.pricePerNight || item.price || 0); const nights = item.nights || 1; const guests = item.guests || 1; const isPerHead = item.isPerHead || item.id === 'Z8' || item.id === 'R6528' || item.type === 'ground'; const total = isPerHead ? (price * nights * guests) : (price * nights); return ( <tr key={'r'+idx} className="border-b border-gray-200"><td className="py-2 px-3 text-center">{idx+1}</td><td className="py-2 px-3"><div className="font-bold text-gray-800">{item.name}</div><div className="text-xs text-gray-500">({guests} ท่าน) x {nights} คืน</div></td><td className="py-2 px-3 text-center">1</td><td className="py-2 px-3 text-right">{total.toLocaleString()}</td></tr> ); })}
                                        {foodItems.length > 0 && ( <tr className="bg-gray-100 font-bold"><td colSpan="4" className="py-1 px-3 text-xs text-gray-600">ค่าอาหารและบริการ (Food & Services)</td></tr> )}
                                        {foodItems.map((item, idx) => { const total = (item.price || 0) * (item.qty || 1); return ( <tr key={'f'+idx} className="border-b border-gray-200"><td className="py-2 px-3 text-center">{idx+1}</td><td className="py-2 px-3">{item.name}</td><td className="py-2 px-3 text-center">{item.qty}</td><td className="py-2 px-3 text-right">{total.toLocaleString()}</td></tr> ); })}
                                    </> );
                                })()}
                            </tbody>
                            <tfoot>
                                {(() => {
                                    const cart = safeJsonParse(viewBooking.cart, []);
                                    const roomItems = cart.filter(c => c.type !== 'food'); const foodItems = cart.filter(c => c.type === 'food');
                                    const roomSum = roomItems.reduce((s, i) => { const p = i.pricePerNight||i.price||0; const n = i.nights||1; const g = i.guests||1; const isPH = i.isPerHead || i.id === 'Z8' || i.id === 'R6528' || i.type === 'ground'; return s + (isPH ? p * n * g : p * n); }, 0);
                                    const foodSum = foodItems.reduce((s, i) => s + ((i.price||0) * (i.qty||1)), 0);
                                    const netPrice = Number(viewBooking.price || 0); const deposit = Number(viewBooking.deposit || 0);
                                    const totalCalculated = roomSum + foodSum; const discount = totalCalculated - netPrice;
                                    
                                    const noteRowSpan = discount > 0 ? 5 : 4; 

                                    return ( <>
                                        <tr><td colSpan="2" rowSpan={noteRowSpan} className="align-top pt-4 pr-4"><div className="border border-gray-300 rounded p-3 text-xs text-gray-600 h-full w-full"><p className="font-bold mb-1">หมายเหตุ:</p><p>- กรุณาตรวจสอบรายการให้ถูกต้อง</p><p>- ขอบคุณที่ใช้บริการขนำลุงดำ</p></div></td><td className="pt-4 text-right font-bold text-gray-700 text-sm">รวมค่าที่พัก</td><td className="pt-4 text-right font-medium text-sm">{formatMoney(roomSum)}</td></tr>
                                        <tr><td className="pt-1 text-right font-bold text-gray-700 text-sm">รวมค่าบริการ</td><td className="pt-1 text-right font-medium text-sm">{formatMoney(foodSum)}</td></tr>
                                        {discount > 0 && ( <tr><td className="pt-1 text-right font-bold text-green-600 text-sm">ส่วนลด</td><td className="pt-1 text-right font-medium text-green-600 text-sm">-{formatMoney(discount)}</td></tr> )}
                                        <tr><td className="pt-1 text-right font-bold text-gray-800 text-sm border-t border-gray-300 mt-1">ยอดสุทธิ</td><td className="pt-1 text-right font-bold text-gray-800 text-sm border-t border-gray-300 mt-1">{formatMoney(netPrice)}</td></tr>
                                        <tr><td className="pt-1 text-right text-sm text-red-500">หัก มัดจำ</td><td className="pt-1 text-right text-sm text-red-500">-{formatMoney(deposit)}</td></tr>
                                        <tr className="bg-gray-100"><td colSpan="2"></td><td className="py-2 text-right font-bold text-xl text-green-700 border-b border-gray-200">ยอดคงเหลือ</td><td className="py-2 text-right font-bold text-xl text-green-700 border-b border-gray-200 pr-3">{formatMoney(netPrice - deposit)} ฿</td></tr>
                                    </> );
                                })()}
                            </tfoot>
                        </table>
                        
                        <div className="mt-auto pt-8 flex w-full justify-between items-end px-8">
                            <div className="text-center flex-1"><div className="border-b border-black w-48 mx-auto mb-2"></div><p className="text-sm font-bold">ผู้รับเงิน (Payee)</p><p className="text-xs text-gray-500">วันที่: ...../...../.......</p></div>
                            <div className="text-center flex-1"><div className="border-b border-black w-48 mx-auto mb-2"></div><p className="text-sm font-bold">ผู้จ่ายเงิน (Payer)</p><p className="text-xs text-gray-500">วันที่: ...../...../.......</p></div>
                        </div>
                        <div className="absolute bottom-4 w-full text-center text-[10px] text-gray-400 left-0"><p>ขอบคุณที่ใช้บริการ ขนำลุงดำ แคมป์ปิ้ง | System Generated</p></div>
                    </div>
                )}
                
                {viewBooking && (
                    <div id="official-receipt-print-area">
                        <div className="flex justify-between items-start mb-6 border-b-2 border-gray-800 pb-4">
                            <div className="flex gap-4 items-center">
                                <div className="w-24 h-24 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                                    {siteSettings && siteSettings.logoUrl ? ( <img src={siteSettings.logoUrl} className="w-full h-full object-contain" alt="Logo" onError={(e) => e.target.style.display = 'none'} /> ) : <span className="text-gray-400 text-xs">NO LOGO</span>}
                                </div>
                                <div><h1 className="text-2xl font-bold text-green-900">{siteSettings && siteSettings.headerTitle}</h1><p className="text-sm text-gray-600">หมู่ที่ 3 ต.ฉลุง อ.หาดใหญ่ จ.สงขลา 90110</p><p className="text-sm font-bold mt-2 text-black"><i className="fas fa-phone-alt mr-1"></i> โทร: {SHOP_PHONE} (พร้อมเพย์)</p></div>
                            </div>
                            <div className="text-right"><h2 className="text-3xl font-bold text-gray-800 uppercase tracking-widest">RECEIPT</h2><p className="text-sm text-gray-500">ใบเสร็จรับเงิน</p><div className="mt-4 text-sm"><p><b>เลขที่:</b> {viewBooking.id}</p><p><b>วันที่:</b> {new Date().toLocaleDateString('th-TH')}</p></div></div>
                        </div>
                        
                        <div className="flex w-full justify-between mb-6 bg-gray-50 p-4 rounded border border-gray-200">
                            <div className="flex-1 pr-4 border-r border-gray-200"><h3 className="font-bold text-gray-700 mb-2 border-b pb-1">ลูกค้า (Customer)</h3><p className="text-sm mb-1"><b>ชื่อ:</b> {viewBooking.name}</p><p className="text-sm mb-1"><b>เบอร์โทร:</b> {viewBooking.phone}</p><p className="text-sm"><b>LINE ID:</b> {viewBooking.lineProfile}</p></div>
                            <div className="flex-1 pl-4 text-right"><h3 className="font-bold text-gray-700 mb-2 border-b pb-1">รายละเอียดการเข้าพัก</h3><p className="text-sm mb-1"><b>เช็คอิน:</b> {formatThaiDateGlobal(viewBooking.checkIn)}</p><p className="text-sm mb-1"><b>เช็คเอาท์:</b> {formatThaiDateGlobal(viewBooking.checkOut)}</p><p className="text-sm"><b>จำนวน:</b> {viewBooking.totalGuests} ท่าน</p></div>
                        </div>

                        <table className="w-full mb-4 border-collapse">
                            <thead><tr className="bg-gray-800 text-white text-sm"><th className="py-2 px-3 text-left rounded-tl w-12">#</th><th className="py-2 px-3 text-left">รายการ (Description)</th><th className="py-2 px-3 text-right w-24">จำนวน</th><th className="py-2 px-3 text-right w-32 rounded-tr">จำนวนเงิน</th></tr></thead>
                            <tbody className="text-sm">
                                {(() => {
                                    const cart = safeJsonParse(viewBooking.cart, []);
                                    const roomItems = cart.filter(c => c.type !== 'food'); 
                                    const foodItems = cart.filter(c => c.type === 'food');
                                    const foodSum = foodItems.reduce((s, i) => s + ((i.price||0) * (i.qty||1)), 0);
                                    return ( <>
                                        {roomItems.length > 0 && ( <tr className="bg-gray-100 font-bold"><td colSpan="4" className="py-1 px-3 text-xs text-gray-600">ค่าที่พัก (Accommodation)</td></tr> )}
                                        {roomItems.map((item, idx) => { const price = (item.pricePerNight || item.price || 0); const nights = item.nights || 1; const guests = item.guests || 1; const isPerHead = item.isPerHead || item.id === 'Z8' || item.id === 'R6528' || item.type === 'ground'; const total = isPerHead ? (price * nights * guests) : (price * nights); return ( <tr key={'or'+idx} className="border-b border-gray-200"><td className="py-2 px-3 text-center">{idx+1}</td><td className="py-2 px-3"><div className="font-bold text-gray-800">{item.name}</div><div className="text-xs text-gray-500">({guests} ท่าน) x {nights} คืน</div></td><td className="py-2 px-3 text-center">1</td><td className="py-2 px-3 text-right">{total.toLocaleString()}</td></tr> ); })}
                                        {foodSum > 0 && ( <>
                                            <tr className="bg-gray-100 font-bold"><td colSpan="4" className="py-1 px-3 text-xs text-gray-600">ค่าอาหารและบริการ (Food & Services)</td></tr>
                                            <tr className="border-b border-gray-200"><td className="py-2 px-3 text-center">1</td><td className="py-2 px-3">รวมค่าอาหารและบริการเสริม</td><td className="py-2 px-3 text-center">-</td><td className="py-2 px-3 text-right">{foodSum.toLocaleString()}</td></tr>
                                        </> )}
                                    </> );
                                })()}
                            </tbody>
                            <tfoot>
                                {(() => {
                                    const cart = safeJsonParse(viewBooking.cart, []);
                                    const roomItems = cart.filter(c => c.type !== 'food'); const foodItems = cart.filter(c => c.type === 'food');
                                    const roomSum = roomItems.reduce((s, i) => { const p = i.pricePerNight||i.price||0; const n = i.nights||1; const g = i.guests||1; const isPH = i.isPerHead || i.id === 'Z8' || i.id === 'R6528' || i.type === 'ground'; return s + (isPH ? p * n * g : p * n); }, 0);
                                    const foodSum = foodItems.reduce((s, i) => s + ((i.price||0) * (i.qty||1)), 0);
                                    const netPrice = Number(viewBooking.price || 0); 
                                    const totalCalculated = roomSum + foodSum; const discount = totalCalculated - netPrice;
                                    
                                    const noteRowSpan = discount > 0 ? 3 : 2; 

                                    return ( <>
                                        <tr><td colSpan="2" rowSpan={noteRowSpan} className="align-top pt-4 pr-4"><div className="border border-gray-300 rounded p-3 text-xs text-gray-600 h-full w-full"><p className="font-bold mb-1">หมายเหตุ:</p><p>- ขอบคุณที่ใช้บริการขนำลุงดำ</p></div></td><td className="pt-4 text-right font-bold text-gray-700 text-sm">รวมค่าที่พัก</td><td className="pt-4 text-right font-medium text-sm">{formatMoney(roomSum)}</td></tr>
                                        <tr><td className="pt-1 text-right font-bold text-gray-700 text-sm">รวมค่าบริการ</td><td className="pt-1 text-right font-medium text-sm">{formatMoney(foodSum)}</td></tr>
                                        {discount > 0 && ( <tr><td className="pt-1 text-right font-bold text-green-600 text-sm">ส่วนลด</td><td className="pt-1 text-right font-medium text-green-600 text-sm">-{formatMoney(discount)}</td></tr> )}
                                        <tr className="bg-gray-100"><td colSpan="2"></td><td className="py-2 text-right font-bold text-xl text-gray-800 border-t border-b border-gray-300 mt-1">ยอดสุทธิรวม</td><td className="py-2 text-right font-bold text-xl text-gray-800 border-t border-b border-gray-300 mt-1 pr-3">{formatMoney(netPrice)} ฿</td></tr>
                                    </> );
                                })()}
                            </tfoot>
                        </table>
                        
                        <div className="mt-auto pt-8 flex w-full justify-between items-end px-8">
                            <div className="text-center flex-1"><div className="border-b border-black w-48 mx-auto mb-2"></div><p className="text-sm font-bold">ผู้รับเงิน (Payee)</p><p className="text-xs text-gray-500">วันที่: ...../...../.......</p></div>
                            <div className="text-center flex-1"><div className="border-b border-black w-48 mx-auto mb-2"></div><p className="text-sm font-bold">ผู้จ่ายเงิน (Payer)</p><p className="text-xs text-gray-500">วันที่: ...../...../.......</p></div>
                        </div>
                        <div className="absolute bottom-4 w-full text-center text-[10px] text-gray-400 left-0"><p>ขอบคุณที่ใช้บริการ ขนำลุงดำ แคมป์ปิ้ง | System Generated</p></div>
                    </div>
                )}
            </div>
            {loading && isLoggedIn && <CampingAdminLoader text="กำลังจัดการข้อมูลหลังบ้าน..." />}
        </div>
    );
};

function CustomerApp() {
    const [isDark, setIsDark] = useState(true);
    const [step, setStep] = useState(1);
    const [mode, setMode] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('mode') === 'manage' ? 'manage' : 'booking';
    }); 

    const [isInitializing, setIsInitializing] = useState(true); 
    const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
    const [availability, setAvailability] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cart, setCart] = useState([]);
    const [customer, setCustomer] = useState({ name: '', phone: '', userId: '', lineDisplayName: '' });
    const [isLiffReady, setIsLiffReady] = useState(false);
    const [pinPos, setPinPos] = useState(DEFAULT_POSITIONS);
    
    const [roomConfig, setRoomConfig] = useState({});
    const [systemSettings, setSystemSettings] = useState({ closed: [], special: [] });
    const [siteConfig, setSiteConfig] = useState(DEFAULT_CONFIG);

    const [discount, setDiscount] = useState({ code: '', val: 0, type: '', message: '', status: '' });
    const [checkingDiscount, setCheckingDiscount] = useState(false);
    const [slipImg, setSlipImg] = useState(null);
    const [bookingResult, setBookingResult] = useState(null);
    const [agreed, setAgreed] = useState(false);
    const [qrUrl, setQrUrl] = useState(null);
    
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [guestCount, setGuestCount] = useState(1);
    const [selectedFood, setSelectedFood] = useState(null);
    const [foodCount, setFoodCount] = useState(1);
    const [foodNote, setFoodNote] = useState('');
    const [closedModal, setClosedModal] = useState(null); 
    const [searchError, setSearchError] = useState(null);
    const [currentImgIdx, setCurrentImgIdx] = useState(0);
    const [showRoomRequiredModal, setShowRoomRequiredModal] = useState(false);

    const [manageData, setManageData] = useState(null);
    const [bookingList, setBookingList] = useState([]); 
    const [rescheduleDates, setRescheduleDates] = useState({ checkIn: '', checkOut: '' });
    const [manageTab, setManageTab] = useState('info'); 
    const [addOnCart, setAddOnCart] = useState([]); 
    const [addOnSlip, setAddOnSlip] = useState(null);
    const [addOnQr, setAddOnQr] = useState(null);
    const [manageForm, setManageForm] = useState({ bookingId: '', phone: '' });

    const [modalAlert, setModalAlert] = useState({ show: false, type: 'info', title: '', text: '' }); 
    const [modalConfirm, setModalConfirm] = useState({ show: false, title: '', text: '', onConfirm: null });

    useEffect(() => {
        if (isDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [isDark]);

    const getTommorow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; };
    const formatThaiDate = (dateStr) => { if(!dateStr) return "-"; const d = new Date(dateStr); const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`; };
    
    const getClosedDateOverlap = (inDate, outDate) => {
        let current = new Date(inDate); const end = new Date(outDate);
        while(current < end) { const dStr = current.toISOString().split('T')[0]; const closed = systemSettings.closed.find(c => c.date === dStr); if (closed) return closed; current.setDate(current.getDate() + 1); }
        return null;
    };
    const checkDateOverlapHighSeason = (inDate, outDate) => {
        let current = new Date(inDate); const end = new Date(outDate);
        while(current < end) { const dStr = current.toISOString().split('T')[0]; if (systemSettings.special.some(s => s.date === dStr)) return true; current.setDate(current.getDate() + 1); }
        return false;
    };

    const calculateNights = () => { if(!dates.checkIn || !dates.checkOut) return 0; return Math.round((new Date(dates.checkOut) - new Date(dates.checkIn)) / (1000 * 3600 * 24)); }
    
    const getPricing = () => {
        const nights = calculateNights(); let roomTotal = 0; let foodTotal = 0; let z8Total = 0;
        
        cart.forEach(item => { 
            if (item.type === 'food') foodTotal += Number(item.price||0) * Number(item.qty||1); 
            else if (item.isPerHead) z8Total += Number(item.pricePerNight||0) * nights * Number(item.guests||1); 
            else roomTotal += Number(item.pricePerNight||0) * nights; 
        });
        
        let discountAmt = 0; if (discount.type === 'FIXED') discountAmt = Number(discount.val||0); if (discount.type === 'PERCENT') discountAmt = (roomTotal * Number(discount.val||0)) / 100; if (discountAmt > roomTotal) discountAmt = roomTotal; 
        const totalBefore = roomTotal + z8Total + foodTotal; const netTotal = totalBefore - discountAmt;
        
        let deposit = 0; const isHigh = checkDateOverlapHighSeason(dates.checkIn, dates.checkOut);
        
        if (isHigh) {
            deposit = netTotal; 
        } else { 
            const roomDeposit = (roomTotal - discountAmt) * 0.5; 
            deposit = roomDeposit + z8Total + foodTotal; 
        }
        return { total: totalBefore, discount: discountAmt, netTotal: netTotal, deposit: Math.ceil(deposit), isHighSeason: isHigh };
    };
    
    const isBookingPast = (dateStr) => {
        if(!dateStr) return false;
        const today = new Date();
        today.setHours(0,0,0,0);
        const checkOutDate = new Date(dateStr);
        checkOutDate.setHours(0,0,0,0);
        return checkOutDate < today;
    };

    const pricing = useMemo(() => getPricing(), [cart, dates, discount, systemSettings]);
    const canSubmit = customer.name && customer.phone && slipImg && agreed;

    useEffect(() => {
        setIsInitializing(true);
        if (LIFF_ID && window.liff) {
            window.liff.init({ liffId: LIFF_ID }).then(() => {
                setIsLiffReady(true);
                if (window.liff.isLoggedIn()) {
                    window.liff.getProfile().then(profile => {
                        setCustomer(prev => ({...prev, userId: profile.userId, lineDisplayName: profile.displayName}));
                    });
                } else {
                    window.liff.login({ redirectUri: window.location.href });
                }
            }).catch(err => { console.error('LIFF Error', err); setIsLiffReady(true); });
        } else { setIsLiffReady(true); }
        
        fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=getInitialData`).then(r => r.json()).then(res => {
            if (res.status === 'success') {
                const { settings, siteConfig, roomConfig, mapConfig } = res.data;
                setSystemSettings({ closed: settings.closed, special: settings.special });
                setSiteConfig(prev => ({ ...prev, ...siteConfig }));
                setRoomConfig(roomConfig);
                setPinPos(mapConfig);
            }
            setIsInitializing(false);
        }).catch(e=>{
            console.error(e);
            setIsInitializing(false);
        });
    }, []);

    useEffect(() => {
        if (step === 3 && pricing.deposit > 0) {
            const payload = generatePromptPayPayload(PROMPTPAY_PHONE, pricing.deposit); 
            createQRWithLogo(payload, 400, siteConfig.logoUrl).then(url => setQrUrl(url));
        }
    }, [step, pricing.deposit, siteConfig.logoUrl]);

    useEffect(() => {
        if (mode === 'manage' && manageTab === 'food') {
            const total = addOnCart.reduce((sum,c)=>sum+(c.price*c.qty),0);
            if (total > 0) { 
                const payload = generatePromptPayPayload(PROMPTPAY_PHONE, total); 
                createQRWithLogo(payload, 400, siteConfig.logoUrl).then(url => setAddOnQr(url)); 
            } else { setAddOnQr(null); }
        }
    }, [addOnCart, mode, manageTab, siteConfig.logoUrl]);

    useEffect(() => {
        if (mode === 'manage' && isLiffReady && customer.userId && !manageData) {
            setLoading(true);
            fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'findBooking', userId: customer.userId }) })
            .then(r => r.json())
            .then(res => {
                setLoading(false);
                if(res.status === 'success' && res.bookings && res.bookings.length > 0) { 
                    setBookingList(res.bookings); 
                    const params = new URLSearchParams(window.location.search);
                    const targetId = params.get('id');
                    if (targetId) {
                        const targetBooking = res.bookings.find(b => b.id === targetId);
                        if (targetBooking) {
                            selectBookingToManage(targetBooking);
                        }
                    }
                } else { setBookingList([]); }
            }).catch(e => {
                setLoading(false);
            });
        }
    }, [mode, isLiffReady, customer.userId, manageData]);

    const handleSearch = () => {
        if (!dates.checkIn || !dates.checkOut) { setSearchError('กรุณาเลือกวันเข้าพักและวันที่ออกให้ครบถ้วนครับ'); return; }
        if (dates.checkIn >= dates.checkOut) { setSearchError('วันเช็คเอาท์ต้องอยู่หลังจากวันเช็คอินครับ'); return; }
        const closedFound = getClosedDateOverlap(dates.checkIn, dates.checkOut); if (closedFound) { setClosedModal(closedFound); return; }
        setLoading(true);
        fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=getAvailability&checkIn=${dates.checkIn}&checkOut=${dates.checkOut}&_t=${Date.now()}`)
        .then(r => r.json()).then(data => { setAvailability(data); setStep(2); setLoading(false); })
        .catch(e => { setLoading(false); setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: e.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้งครับ' : String(e) }); });
    };

    const openRoomModal = (roomId) => { 
        const room = roomConfig[roomId]; 
        if (!room) return; 
        const searchStr = (room.type + " " + room.name).toLowerCase();
        const isSharedZone = room.type === 'ground' || roomId === 'Z8' || roomId === 'R6528' || searchStr.includes('tent') || searchStr.includes('เต็นท์') || searchStr.includes('ลานกาง') || searchStr.includes('ground');
        
        if(isSharedZone) setGuestCount(1); 
        else setGuestCount(parseInt(room.min) || 1); 
        
        setCurrentImgIdx(0); 
        setSelectedRoomId(roomId); 
    };

    const openFoodModal = (food) => { setSelectedFood(food); setFoodCount(1); setFoodNote(''); };
    
    const confirmFoodSelection = () => {
        const targetCart = mode === 'manage' ? addOnCart : cart; 
        const setTargetCart = mode === 'manage' ? setAddOnCart : setCart;
        
        const finalName = foodNote.trim() ? `${selectedFood.name} (${foodNote.trim()})` : selectedFood.name;
        const existIndex = targetCart.findIndex(c => c.id === selectedFood.id && c.name === finalName && c.type === 'food');
        
        if (existIndex > -1) {
            const newCart = [...targetCart];
            newCart[existIndex].qty += foodCount;
            setTargetCart(newCart);
        } else { 
            setTargetCart([...targetCart, { ...selectedFood, name: finalName, type: 'food', qty: foodCount }]);
        }
        
        setSelectedFood(null);
        setFoodNote('');
    };

    const nextImage = () => { if(!selectedRoomId) return; const images = siteConfig.roomImages[selectedRoomId] || []; setCurrentImgIdx((prev) => (prev + 1) % images.length); };
    const prevImage = () => { if(!selectedRoomId) return; const images = siteConfig.roomImages[selectedRoomId] || []; setCurrentImgIdx((prev) => (prev - 1 + images.length) % images.length); };
    
    const confirmRoomSelection = () => {
        const roomId = selectedRoomId; 
        const guests = guestCount; 
        const roomInfo = roomConfig[roomId];
        if (!roomInfo) { setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: "พบปัญหาข้อมูลห้องพักไม่สมบูรณ์" }); setSelectedRoomId(null); return; }
        
        const searchStr = (roomInfo.type + " " + roomInfo.name).toLowerCase();
        const isSharedZone = roomInfo.type === 'ground' || roomId === 'Z8' || roomId === 'R6528' || searchStr.includes('tent') || searchStr.includes('เต็นท์') || searchStr.includes('ลานกาง') || searchStr.includes('ground');
        
        let limit = parseInt(roomInfo.maxCap) || 10;
        
        if (isSharedZone) {
            let avail = limit;
            if (availability && availability.roomAvailableCount && availability.roomAvailableCount[roomId] !== undefined) {
                 avail = parseInt(availability.roomAvailableCount[roomId]);
            } else if (availability) {
                 avail = availability.tentAvailable && availability.tentAvailable[roomId] !== undefined ? parseInt(availability.tentAvailable[roomId]) : parseInt(availability.zone8Available || limit);
            }
            const currentInCart = cart.filter(c => c.id === roomId).reduce((sum, c) => sum + parseInt(c.guests || 1), 0);
            limit = Math.max(0, avail - currentInCart);
        }
        
        if (isSharedZone && guests > limit) {
            setModalAlert({ show: true, type: 'warning', title: 'โควต้าไม่เพียงพอ', text: `ที่พักนี้ว่างอีก ${limit} ท่าน` });
            return;
        }
        
        let price = 0; 
        const pricingInfo = typeof roomInfo.pricing === 'string' ? safeJsonParse(roomInfo.pricing, {}) : (roomInfo.pricing || {});
        const isPerHead = isSharedZone || pricingInfo.priceHead !== undefined;
        
        if (isPerHead) { 
            price = Number(pricingInfo.priceHead || (pricingInfo.tiers && pricingInfo.tiers.length > 0 ? pricingInfo.tiers[0].price : 150)); 
        } else { 
            const tiers = pricingInfo.tiers || [];
            if (tiers.length > 0) {
                const tier = tiers.find(t => guests <= t.max); 
                if (!tier) { const maxTier = tiers[tiers.length - 1]; price = Number(maxTier ? maxTier.price : 0); } 
                else { price = Number(tier.price); } 
            }
        }
        
        setCart([...cart, { id: roomId, name: roomInfo.name, type: roomInfo.type, guests: guests, pricePerNight: price, nights: calculateNights(), isPerHead }]); 
        setSelectedRoomId(null);
    };

    const checkDiscountCode = () => { 
        if(!discount.code) return; setCheckingDiscount(true); 
        fetchWithTimeout(`${GOOGLE_SCRIPT_URL}?action=checkDiscount&code=${discount.code}`).then(r=>r.json()).then(d => { setCheckingDiscount(false); if(d.status === 'success') setDiscount({...discount, val: Number(d.value), type: d.type, message: `ใช้โค้ดสำเร็จ ลด ${d.value} ${d.type==='PERCENT'?'%':'บาท'}`, status: 'success'}); else setDiscount({...discount, val: 0, type: '', message: 'ไม่พบโค้ดส่วนลดนี้', status: 'error'}); }).catch(e => { setCheckingDiscount(false); setDiscount({...discount, val: 0, type: '', message: e.name === 'AbortError' ? 'เน็ตหมดเวลา' : 'เกิดข้อผิดพลาด', status: 'error'}); }); 
    };

    const handleSubmit = () => {
        if (!canSubmit) return; setLoading(true);
        const payload = { action: 'saveBooking', customer, checkIn: dates.checkIn, checkOut: dates.checkOut, totalGuests: cart.filter(c => c.type !== 'food').reduce((s, c) => s + parseInt(c.guests || 1), 0), cart, pricing, discountCode: discount.code, slipImage: slipImg };
        fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json()).then(res => { if (res.status === 'success') { setBookingResult(res.bookingId); setStep(5); } else { setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: res.message }); } setLoading(false); }).catch(e => { setLoading(false); setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: e.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้งครับ' : String(e) }); });
    };
    
    const selectBookingToManage = (booking, tab = 'info') => { setManageData(booking); setManageForm({ bookingId: booking.id, phone: booking.phone }); setManageTab(tab); }
    
    const handleCustomerReschedule = () => {
        if(!rescheduleDates.checkIn || !rescheduleDates.checkOut) return setModalAlert({ show: true, type: 'warning', title: 'แจ้งเตือน', text: 'กรุณาเลือกวันเข้าพักและวันออกใหม่' });
        if(rescheduleDates.checkIn < getTommorow()) return setModalAlert({ show: true, type: 'warning', title: 'แจ้งเตือน', text: 'ไม่สามารถเลือกวันที่ปัจจุบันหรือย้อนหลังได้' });
        if(rescheduleDates.checkIn >= rescheduleDates.checkOut) return setModalAlert({ show: true, type: 'warning', title: 'แจ้งเตือน', text: 'วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน' });
        const today = new Date(); today.setHours(0,0,0,0);
        const currentCheckIn = new Date(manageData.checkIn); currentCheckIn.setHours(0,0,0,0);
        const diffTime = currentCheckIn.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
        if (diffDays < 7) return setModalAlert({ show: true, type: 'warning', title: 'ไม่สามารถเลื่อนได้', text: `ต้องทำการเลื่อนล่วงหน้าอย่างน้อย 7 วัน (เหลืออีก ${diffDays} วัน)` });

        setModalConfirm({ show: true, title: 'ยืนยันการเลื่อนวัน', text: `เปลี่ยนเป็น\n${formatThaiDate(rescheduleDates.checkIn)} - ${formatThaiDate(rescheduleDates.checkOut)}`, onConfirm: () => { setModalConfirm({ ...modalConfirm, show: false }); executeReschedule(); } });
    };

    const executeReschedule = () => {
        setLoading(true);
        fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'customerReschedule', bookingId: manageData.id, phone: manageData.phone, newCheckIn: rescheduleDates.checkIn, newCheckOut: rescheduleDates.checkOut }) })
        .then(r => r.json()).then(res => { setLoading(false); if(res.status === 'success') { setModalAlert({ show: true, type: 'success', title: 'สำเร็จ!', text: 'เลื่อนวันเรียบร้อย' }); setManageData(null); setMode('booking'); } else { setModalAlert({ show: true, type: 'error', title: 'ไม่สำเร็จ', text: res.message }); } }).catch(e => { setLoading(false); setModalAlert({ show: true, type: 'error', title: 'Error', text: e.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานานเกินไป' : String(e) }); });
    };

    const handleCustomerAddFood = () => {
        if(addOnCart.length === 0) return setModalAlert({ show: true, type: 'warning', title: 'แจ้งเตือน', text: 'กรุณาเลือกอาหาร' });
        if(!addOnSlip) return setModalAlert({ show: true, type: 'warning', title: 'แจ้งเตือน', text: 'กรุณาแนบสลิป' });
        const today = new Date(); today.setHours(0,0,0,0);
        const currentCheckIn = new Date(manageData.checkIn); currentCheckIn.setHours(0,0,0,0);
        const diffTime = currentCheckIn.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
        if (diffDays < 2) return setModalAlert({ show: true, type: 'warning', title: 'ไม่สามารถสั่งเพิ่มได้', text: 'ต้องสั่งอาหารล่วงหน้าอย่างน้อย 2 วันก่อนเข้าพัก' });
        setModalConfirm({ show: true, title: 'ยืนยันการสั่งอาหาร', text: `รายการ:\n${addOnCart.map(i => '- '+i.name).join('\n')}`, onConfirm: () => { setModalConfirm({ ...modalConfirm, show: false }); executeAddFood(); } });
    };

    const executeAddFood = () => {
        setLoading(true);
        fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'customerAddFood', bookingId: manageData.id, phone: manageData.phone, newFoodItems: addOnCart, slipImage: addOnSlip }) })
        .then(r => r.json()).then(res => { setLoading(false); if(res.status === 'success') { setModalAlert({ show: true, type: 'success', title: 'สำเร็จ!', text: 'สั่งอาหารเรียบร้อย' }); setManageData(null); setAddOnCart([]); setAddOnSlip(null); setMode('booking'); } else { setModalAlert({ show: true, type: 'error', title: 'ไม่สำเร็จ', text: res.message }); } }).catch(e => { setLoading(false); setModalAlert({ show: true, type: 'error', title: 'Error', text: e.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานานเกินไป' : String(e) }); });
    };

    return (
        <div className="min-h-screen text-gray-800 dark:text-gray-100 relative w-full h-full">
            {/* THEME TOGGLE */}
            <button onClick={() => setIsDark(!isDark)} className="fixed top-4 right-4 z-50 bg-white dark:bg-gray-700 p-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 w-10 h-10 flex items-center justify-center transition-transform hover:scale-110"> {isDark ? '☀️' : '🌙'} </button>
            
            {/* MODE TOGGLE */}
            <button onClick={() => { setMode(mode === 'booking' ? 'manage' : 'booking'); setStep(1); setManageData(null); setManageTab('info'); }} className="fixed top-16 right-4 z-50 bg-white dark:bg-gray-700 p-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 w-10 h-10 flex items-center justify-center transition-transform hover:scale-110 text-gray-800 dark:text-white"> {mode === 'booking' ? <i className="fas fa-search"></i> : <i className="fas fa-home"></i>} </button>

            {/* --- MANAGE MODE --- */}
            {mode === 'manage' && (
                <div className="max-w-md mx-auto p-4 pt-16">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 min-h-[300px]">
                        <h2 className="text-xl font-bold mb-4 text-center text-blue-600 dark:text-blue-400">จัดการการจอง</h2>
                        
                        {!manageData ? (
                            <div className="animate-pop">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <i className="fas fa-campground text-5xl text-green-600 animate-bounce mb-4"></i>
                                        <p className="text-gray-500 dark:text-gray-400 font-bold">กำลังกางเต็นท์ข้อมูล...</p>
                                    </div>
                                ) : (
                                    !isLiffReady ? (
                                        <div className="text-center py-10">
                                            <p className="text-gray-500">Connecting to LINE...</p>
                                        </div>
                                    ) : (
                                        !customer.userId ? (
                                            <div className="text-center py-10">
                                                <div className="text-4xl mb-4">⚠️</div>
                                                <p className="text-gray-500">ไม่พบข้อมูลผู้ใช้ LINE</p>
                                                <p className="text-xs text-gray-400 mt-2">กรุณาเปิดผ่านแอป LINE หรือ</p>
                                                <button onClick={() => window.liff.login({ redirectUri: window.location.href })} className="mt-4 bg-green-500 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-green-600 transition">เข้าสู่ระบบ LINE</button>
                                            </div>
                                        ) : (
                                            bookingList.length > 0 ? (
                                                <div className="space-y-4 animate-pop">
                                                    <p className="text-sm text-gray-500 text-center mb-4">พบ {bookingList.length} รายการจอง</p>
                                                    {bookingList.map(b => {
                                                        const isPast = isBookingPast(b.checkOut);
                                                        return (
                                                            <div key={b.id} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
                                                                <div onClick={() => selectBookingToManage(b, 'info')} className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                         <span className="font-bold text-blue-600 dark:text-blue-400 text-lg">{b.id}</span>
                                                                         <span className={`text-xs px-2 py-1 rounded-full font-bold ${isPast ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'}`}>{isPast ? 'สำเร็จ' : b.status}</span>
                                                                    </div>
                                                                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                                                                        <div className="flex items-center"><i className="fas fa-calendar-day w-5 text-center mr-2 text-gray-400"></i> {formatThaiDate(b.checkIn)}</div>
                                                                        <div className="flex items-center"><i className="fas fa-home w-5 text-center mr-2 text-gray-400"></i> {b.rooms}</div>
                                                                    </div>
                                                                </div>
                                                                {!isPast ? (
                                                                    <div className="flex border-t border-gray-100 dark:border-gray-600 divide-x divide-gray-100 dark:divide-gray-600 bg-gray-50 dark:bg-gray-800">
                                                                        <button onClick={() => selectBookingToManage(b, 'reschedule')} className="flex-1 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 dark:hover:bg-gray-700 transition flex items-center justify-center gap-2">
                                                                            <i className="fas fa-calendar-alt"></i> เลื่อนวัน
                                                                        </button>
                                                                        <button onClick={() => selectBookingToManage(b, 'food')} className="flex-1 py-3 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-gray-700 transition flex items-center justify-center gap-2">
                                                                            <i className="fas fa-utensils"></i> สั่งอาหาร
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-gray-50 dark:bg-gray-800 p-3 text-center text-xs text-gray-400 border-t border-gray-100 dark:border-gray-600">
                                                                        <i className="fas fa-check-circle mr-1"></i> สิ้นสุดการเข้าพัก
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 animate-pop">
                                                    <div className="text-6xl mb-4">🔍</div>
                                                    <p className="text-gray-500">ไม่พบประวัติการจอง</p>
                                                    <p className="text-xs text-gray-400 mt-2">หากเพิ่งจอง กรุณารอแอดมินยืนยันสักครู่</p>
                                                    <button onClick={() => window.location.reload()} className="mt-4 text-blue-600 text-sm underline">ลองใหม่อีกครั้ง</button>
                                                </div>
                                            )
                                        )
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="animate-pop">
                                <div className="flex items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <button onClick={() => setManageData(null)} className="mr-3 text-gray-500 hover:text-blue-600 p-1"><i className="fas fa-arrow-left text-lg"></i></button>
                                    <span className="font-bold text-gray-700 dark:text-gray-200">รายการ: {manageData.id}</span>
                                </div>
                                {(() => {
                                    const isPast = isBookingPast(manageData.checkOut);
                                    return !isPast ? (
                                        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                                            <button onClick={() => setManageTab('info')} className={`flex-1 py-2 text-sm font-bold ${manageTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>ข้อมูล</button>
                                            <button onClick={() => setManageTab('reschedule')} className={`flex-1 py-2 text-sm font-bold ${manageTab === 'reschedule' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'}`}>เลื่อนวัน</button>
                                            <button onClick={() => setManageTab('food')} className={`flex-1 py-2 text-sm font-bold ${manageTab === 'food' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>สั่งอาหาร</button>
                                        </div>
                                    ) : null;
                                })()}

                                {manageTab === 'info' && (
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg mb-6 animate-pop">
                                        <div className="text-center mb-2"><span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">{manageData.status}</span></div>
                                        <h3 className="text-lg font-bold text-center mb-4 text-gray-800 dark:text-white">{manageData.name}</h3>
                                        <div className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
                                            <div className="flex justify-between"><span>เข้าพัก:</span> <b>{formatThaiDate(manageData.checkIn)}</b></div>
                                            <div className="flex justify-between"><span>ออก:</span> <b>{formatThaiDate(manageData.checkOut)}</b></div>
                                            <div className="flex justify-between"><span>จำนวนผู้เข้าพัก:</span> <b>{manageData.guests} คน</b></div>
                                            <div className="flex justify-between"><span>ห้องพัก:</span> <span className="text-right">{manageData.rooms}</span></div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                                            <h4 className="font-bold text-sm text-blue-800 dark:text-blue-300 mb-2">อาหารที่สั่งแล้ว</h4>
                                            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{manageData.food}</p>
                                        </div>
                                    </div>
                                )}

                                {manageTab === 'reschedule' && (
                                    <div className="space-y-3 animate-pop">
                                        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-xs p-2 rounded mb-4 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800">
                                            ⚠️ เงื่อนไข: ต้องเลื่อนล่วงหน้าอย่างน้อย 7 วัน และห้องพักต้องว่างในวันที่เลือกใหม่
                                        </div>
                                        <div><label className="block text-xs font-bold mb-1 text-gray-700 dark:text-gray-300">เช็คอินใหม่</label><input type="date" min={getTommorow()} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" onChange={e => setRescheduleDates({...rescheduleDates, checkIn: e.target.value})} /></div>
                                        <div><label className="block text-xs font-bold mb-1 text-gray-700 dark:text-gray-300">เช็คเอาท์ใหม่</label><input type="date" min={rescheduleDates.checkIn || getTommorow()} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" onChange={e => setRescheduleDates({...rescheduleDates, checkOut: e.target.value})} /></div>
                                        <button onClick={handleCustomerReschedule} disabled={loading} className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold shadow hover:bg-orange-700 transition mt-4">{loading ? 'กำลังทำงาน...' : 'ยืนยันการเลื่อน'}</button>
                                    </div>
                                )}

                                {manageTab === 'food' && (
                                    <div className="space-y-4 animate-pop">
                                        <div className="bg-green-50 dark:bg-green-900/20 text-xs p-2 rounded mb-4 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800">🍽️ เงื่อนไข: สั่งล่วงหน้าอย่างน้อย 2 วันก่อนเข้าพัก</div>
                                        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                                            {siteConfig.foodMenu.map(f => {
                                                const inCart = addOnCart.find(c => c.id === f.id);
                                                return (
                                                    <div key={f.id} onClick={() => {
                                                        const today = new Date(); today.setHours(0,0,0,0);
                                                        const currentCheckIn = new Date(manageData.checkIn); currentCheckIn.setHours(0,0,0,0);
                                                        const diffTime = currentCheckIn.getTime() - today.getTime();
                                                        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
                                                        if (diffDays < 2) {
                                                            setModalAlert({ show: true, type: 'warning', title: 'ไม่สามารถสั่งเพิ่มได้', text: 'ต้องสั่งอาหารล่วงหน้าอย่างน้อย 2 วันก่อนเข้าพัก' });
                                                            return;
                                                        }
                                                        openFoodModal(f);
                                                    }} className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all shadow-sm relative ${inCart ? 'border-green-500 bg-green-50 dark:bg-green-900 dark:border-green-500' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700'}`}>
                                                        <img src={f.img} className="w-full h-20 object-cover" />
                                                        <div className="p-1"><h4 className="font-bold text-xs line-clamp-1">{f.name}</h4><div className="flex justify-between items-center mt-1"><span className="text-green-600 text-xs font-bold">{f.price}.-</span>{inCart && <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">x{inCart.qty}</span>}</div></div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {addOnCart.length > 0 && (
                                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded mb-4">
                                                <h4 className="font-bold text-xs mb-2">รายการที่เลือก ({addOnCart.length})</h4>
                                                {addOnCart.map((c,i)=><div key={i} className="flex justify-between text-xs mt-1"><span>{c.name} x{c.qty}</span><button onClick={()=>setAddOnCart(addOnCart.filter((_,idx)=>idx!==i))} className="text-red-500">ลบ</button></div>)}
                                                <div className="mt-2 pt-2 border-t text-right font-bold text-sm text-green-600 mb-2">รวม {formatMoney(addOnCart.reduce((sum,c)=>sum+(c.price*c.qty),0))} บ.</div>
                                                <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
                                                    <p className="text-xs font-bold mb-2 text-center">สแกนจ่ายเพื่อยืนยันออเดอร์</p>
                                                    {addOnQr && (
                                                        <div className="flex flex-col items-center mb-3">
                                                            <img src={addOnQr} className="mx-auto border-2 border-gray-200 dark:border-gray-600 rounded-xl mb-3 shadow-sm p-2 bg-white" alt="QR Code" style={{ width: '150px', height: '150px' }} />
                                                            <a href={addOnQr} download={`qr-food-${manageData.id}.png`} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 shadow-sm">
                                                                <i className="fas fa-download"></i> บันทึกภาพ QR Code
                                                            </a>
                                                        </div>
                                                    )}
                                                    <div className="text-[10px] text-center mb-2 text-gray-500">{PROMPTPAY_NAME} - {PROMPTPAY_PHONE}</div>
                                                    <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files[0]; if (f) { try { const resizedBase64 = await compressImage(f); setAddOnSlip(resizedBase64); } catch (err) { setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: 'Upload Error' }); } } }} className="text-xs w-full mb-1" />
                                                    {!addOnSlip && <div className="text-red-500 text-[10px] text-center">* กรุณาแนบสลิปโอนเงิน</div>}
                                                </div>
                                            </div>
                                        )}
                                        <button onClick={handleCustomerAddFood} disabled={loading || (addOnCart.length > 0 && !addOnSlip)} className={`w-full py-3 rounded-lg font-bold shadow transition ${loading || (addOnCart.length > 0 && !addOnSlip) ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>{loading ? 'กำลังส่งข้อมูล...ให้แม่ครัว' : 'ยืนยันการสั่งอาหาร'}</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- MODE: BOOKING --- */}
            {mode === 'booking' && step === 1 && (
                <div className="max-w-md mx-auto bg-white dark:bg-gray-800 shadow-xl rounded-xl mt-4 border dark:border-gray-700 overflow-hidden">
                    <div className="h-48 relative"><img src={siteConfig.bannerUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black bg-opacity-10"></div></div>
                    <div className="p-6 -mt-24 relative z-10">
                        <img src={siteConfig.logoUrl} referrerPolicy="no-referrer" className="w-48 h-48 mx-auto rounded-full border-4 border-white dark:border-gray-800 object-cover bg-white shadow-lg mb-4"/>
                        <h1 className="text-xl text-center mb-2 text-green-800 dark:text-green-400 font-bold">{siteConfig.headerTitle}</h1>
                        <p className="block text-center mb-4 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-line">{siteConfig.headerDesc}</p>
                        <div className="space-y-4">
                            <div><label className="block text-gray-700 dark:text-green-400 font-bold mb-1">วันที่เข้าพัก</label><input type="date" min={getTommorow()} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" onChange={e => setDates({...dates, checkIn: e.target.value})} /></div>
                            <div><label className="block text-gray-700 dark:text-red-300 font-bold mb-1">วันที่ออก</label><input type="date" min={dates.checkIn || getTommorow()} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" onChange={e => setDates({...dates, checkOut: e.target.value})} /></div>
                            <button onClick={handleSearch} disabled={loading} className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition font-bold shadow-lg mt-2">{loading ? 'กำลังตรวจสอบ...' : 'ค้นหาที่พักว่าง'}</button>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'booking' && step === 2 && (
                <div className="max-w-4xl mx-auto p-4 relative">
                    <div className="flex justify-between items-center mb-4"><div className="flex items-center gap-2"><button onClick={()=>setStep(1)} className="text-gray-500 dark:text-gray-300 hover:text-green-600 font-bold"><i className="fas fa-chevron-left"></i> ย้อนกลับ</button><h2 className="text-xl font-bold dark:text-white">เลือกที่พัก</h2></div></div>
                    <div className="map-container bg-blue-100 dark:bg-gray-700 mb-6" style={{paddingBottom: '100%'}}>
                        <img src={siteConfig?.roomImages?.['MAP_BG']?.[0] || "https://img2.pic.in.th/3d539b84-44ce-4336-ad90-bd2f84b13eca.jpg"} referrerPolicy="no-referrer" className="absolute top-0 left-0 w-full h-full object-cover" alt="Camp Map" />
                        {Object.keys(pinPos).map(key => {
                            if (!roomConfig[key]) return null;
                            const rConf = roomConfig[key];
                            const searchStr = rConf ? (rConf.type + " " + rConf.name).toLowerCase() : '';
                            const isSharedZone = rConf ? (rConf.type === 'ground') : (key === 'Z8' || key === 'R6528' || searchStr.includes('tent') || searchStr.includes('เต็นท์') || searchStr.includes('ลานกาง') || searchStr.includes('ground'));
                            
                            let available = 1;
                            if (availability && availability.roomAvailableCount && availability.roomAvailableCount[key] !== undefined) {
                                available = parseInt(availability.roomAvailableCount[key]);
                            } else if (availability) {
                                 available = isSharedZone ? (availability.tentAvailable && availability.tentAvailable[key] !== undefined ? parseInt(availability.tentAvailable[key]) : parseInt(availability.zone8Available || 20)) : (availability.bookedRooms.includes(key) ? 0 : 1);
                            }
                            
                            const currentInCart = cart.filter(c => c.id === key).reduce((sum, c) => sum + parseInt(c.guests || 1), 0);
                            const remaining = isSharedZone ? Math.max(0, available - currentInCart) : available;
                            
                            const isBooked = availability && availability.bookedRooms && availability.bookedRooms.includes(key);
                            const inCart = cart.find(c => c.id === key);
                            
                            const disable = isBooked || (isSharedZone && remaining <= 0) || (!isSharedZone && inCart);

                            let circleClasses = "w-12 h-12 rounded-full flex items-center justify-center text-center text-[8px] font-bold border-2 shadow-lg p-1 leading-tight transition-all duration-300";
                            if (disable) circleClasses += " bg-gray-400 text-white border-gray-500 cursor-not-allowed opacity-80 grayscale";
                            else if (inCart) circleClasses += " bg-yellow-400 text-black border-yellow-600 scale-110 shadow-xl z-20";
                            else circleClasses += " bg-white dark:bg-gray-800 text-green-800 dark:text-green-400 border-green-600 hover:scale-110 z-10";
                            return ( 
                                <div key={key} className="absolute transform -translate-x-1/2 -translate-y-1/2 map-pin-responsive" style={{left: `${pinPos[key].x}%`, top: `${pinPos[key].y}%`}} 
                                    onClick={() => { 
                                        if(disable) return; 
                                        if(inCart && !isSharedZone) setCart(cart.filter(c => c.id !== key)); 
                                        else openRoomModal(key); 
                                    }}> 
                                    <div className={circleClasses}> <div> {roomConfig[key].name} </div> </div> 
                                </div> 
                            )
                        })}
                    </div>
                    {selectedRoomId && roomConfig[selectedRoomId] && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm relative">
                                <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden bg-gray-200">
                                    <img src={(siteConfig.roomImages[selectedRoomId]||[])[currentImgIdx] || "https://via.placeholder.com/600x400?text=No+Image"} className="w-full h-full object-cover transition-opacity duration-300" />
                                    {(siteConfig.roomImages[selectedRoomId]||[]).length > 1 && ( <> <button onClick={prevImage} className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full hover:bg-opacity-70"><i className="fas fa-chevron-left"></i></button> <button onClick={nextImage} className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full hover:bg-opacity-70"><i className="fas fa-chevron-right"></i></button> </> )}
                                </div>
                                <h3 className="text-xl font-bold mb-2 text-green-800 dark:text-green-400">{roomConfig[selectedRoomId].name}</h3>
                                <p className="text-gray-500 dark:text-gray-300 text-sm mb-4"> {siteConfig.roomDescriptions?.[selectedRoomId] || "ไม่มีคำอธิบาย"} </p>
                                <div className="flex items-center justify-between mb-6 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                                    <button onClick={() => setGuestCount(Math.max((parseInt(roomConfig[selectedRoomId].min)||1), guestCount - 1))} className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded shadow text-xl font-bold transition-colors">-</button>
                                    <div className="text-center"> <div className="text-2xl font-bold dark:text-white">{guestCount}</div> <div className="text-xs text-gray-500 dark:text-gray-400">คน</div> </div>
                                    <button onClick={() => { 
                                        const rConf = roomConfig[selectedRoomId];
                                        const searchStr = rConf ? (rConf.type + " " + rConf.name).toLowerCase() : '';
                                        const isSharedZone = rConf ? (rConf.type === 'ground') : (selectedRoomId === 'Z8' || selectedRoomId === 'R6528' || searchStr.includes('tent') || searchStr.includes('เต็นท์') || searchStr.includes('ลานกาง') || searchStr.includes('ground'));
                                        
                                        let limit = parseInt(rConf.maxCap) || 10; 
                                        
                                        if (isSharedZone) {
                                            let avail = limit;
                                            if (availability && availability.roomAvailableCount && availability.roomAvailableCount[selectedRoomId] !== undefined) {
                                                 avail = parseInt(availability.roomAvailableCount[selectedRoomId]);
                                            } else if (availability) {
                                                 avail = availability.tentAvailable && availability.tentAvailable[selectedRoomId] !== undefined ? parseInt(availability.tentAvailable[selectedRoomId]) : parseInt(availability.zone8Available || limit);
                                            }
                                            
                                            const currentInCart = cart.filter(c => c.id === selectedRoomId).reduce((sum, c) => sum + parseInt(c.guests || 1), 0);
                                            limit = Math.max(1, avail - currentInCart);
                                        }
                                        
                                        if (guestCount < limit) {
                                            setGuestCount(guestCount + 1);
                                        } else {
                                            setModalAlert({ show: true, type: 'warning', title: 'โควต้าเต็ม', text: `สามารถเพิ่มได้สูงสุด ${limit} ท่านครับ` });
                                        }
                                    }} className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded shadow text-xl font-bold transition-colors">+</button>
                                </div>
                                <div className="flex gap-2"> <button onClick={() => setSelectedRoomId(null)} className="flex-1 py-3 text-gray-500 bg-gray-200 dark:bg-gray-600 dark:text-gray-300 rounded-lg font-bold">ยกเลิก</button> <button onClick={confirmRoomSelection} className="flex-1 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg font-bold shadow-lg">ยืนยัน</button> </div>
                            </div>
                        </div>
                    )}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
                        <h3 className="font-bold mb-4 dark:text-white text-lg">🍽️ สั่งอาหารล่วงหน้า</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {siteConfig.foodMenu.map(f => {
                                const inCartItems = cart.filter(c => c.id === f.id && c.type === 'food');
                                const inCartCount = inCartItems.reduce((sum, item) => sum + item.qty, 0);
                                
                                return ( 
                                    <div key={f.id} onClick={() => openFoodModal(f)} className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all shadow-sm relative ${inCartCount > 0 ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900 dark:border-yellow-500' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 hover:border-green-400'}`} > 
                                        <img src={f.img} className="w-full h-24 object-cover" /> 
                                        <div className="p-2"> 
                                            <h4 className="font-bold text-sm text-gray-800 dark:text-white line-clamp-1">{f.name}</h4> 
                                            {f.desc && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 my-1">{f.desc}</p>} 
                                            <div className="flex justify-between items-center mt-1"> 
                                                <span className="text-green-600 dark:text-green-400 text-sm font-bold">{f.price}.-</span> 
                                                {inCartCount > 0 && <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">x{inCartCount}</span>} 
                                            </div> 
                                        </div> 
                                    </div> 
                                );
                            })}
                        </div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded mb-4"><h3 className="font-bold dark:text-white">🛒 ตะกร้า ({cart.length})</h3> {cart.map((c,i)=><div key={i} className="flex justify-between text-sm mt-1 dark:text-gray-200"><span>{c.name} {c.type==='food'?`x${c.qty}`:`(${c.guests} ท่าน)`}</span><button onClick={()=>setCart(cart.filter((_,idx)=>idx!==i))} className="text-red-500">ลบ</button></div>)} </div>
                    <button onClick={() => { const hasRoom = cart.some(c => c.type !== 'food'); if (!hasRoom) { setShowRoomRequiredModal(true); return; } setStep(3); }} className="w-full bg-green-600 text-white p-3 rounded-lg font-bold"> ดำเนินการต่อ </button>
                </div>
            )}

            {mode === 'booking' && step === 3 && (
                <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 shadow-xl rounded-xl">
                    <div className="flex items-center gap-2 mb-4"><button onClick={()=>setStep(2)} className="text-gray-500 dark:text-gray-300 hover:text-green-600 font-bold text-sm"><i className="fas fa-chevron-left"></i> ย้อนกลับ</button><h2 className="text-xl font-bold dark:text-white">สรุปยอดและชำระเงิน</h2></div>
                    <div className="space-y-2 mb-4 text-sm dark:text-gray-200">
                        <p><strong>เข้าพัก:</strong> {formatThaiDate(dates.checkIn)}</p>
                        <p><strong>คืนห้อง:</strong> {formatThaiDate(dates.checkOut)}</p>
                        <p><strong>จำนวน:</strong> {calculateNights()} คืน</p>
                        {pricing.isHighSeason && <div className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 p-1 rounded">ℹ️ ช่วงเทศกาล/วันพิเศษ คิดมัดจำ 100%</div>}
                        <hr className="dark:border-gray-600"/>
                        {cart.map((c, i) => <div key={i} className="flex justify-between"><span>{c.name} {c.type !== 'food' && `(${c.guests} ท่าน)`}</span><span>{formatMoney(c.type==='food' ? Number(c.price||0)*Number(c.qty||1) : (c.isPerHead ? Number(c.pricePerNight||0) * calculateNights() * Number(c.guests||1) : Number(c.pricePerNight||0)*calculateNights()))} บ.</span></div>)}
                        <hr className="dark:border-gray-600"/>
                        {pricing.discount > 0 && <div className="flex justify-between text-red-500 font-bold"><span>ส่วนลดที่พัก</span><span>-{formatMoney(pricing.discount)} บ.</span></div>}
                        <div className="flex justify-between font-bold text-lg"><span>สุทธิ</span><span>{formatMoney(pricing.netTotal)} บ.</span></div>
                        <div className="bg-yellow-100 dark:bg-yellow-900 p-2 rounded text-center border border-yellow-300 dark:border-yellow-700 mt-2"><span className="block text-sm text-yellow-800 dark:text-yellow-200">ยอดมัดจำที่ต้องโอน</span><span className="text-2xl font-bold text-red-600 dark:text-red-400">{formatMoney(pricing.deposit)} บาท</span></div>
                    </div>
                    <div className="mb-4">
                        <div className="flex gap-2"> <input placeholder="กรอกโค้ดส่วนลด" className="border p-2 rounded flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white" onChange={e => setDiscount({...discount, code: e.target.value})} /> <button className="bg-gray-800 dark:bg-gray-600 text-white px-4 rounded" onClick={checkDiscountCode}>กดใช้โค้ด</button> </div>
                        {discount.message && <p className={`text-xs mt-1 ${discount.status==='success'?'text-green-600 dark:text-green-400':'text-red-500 dark:text-red-400'}`}>{discount.message}</p>}
                    </div>
                    <div className="space-y-3 mb-6">
                        <input placeholder="ชื่อผู้จอง" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
                        <input placeholder="เบอร์โทรศัพท์" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" type="tel" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} />
                    </div>
                    
                    <div className="text-center mb-6">
                        <p className="mb-2 font-bold dark:text-white">สแกนจ่ายมัดจำ (พร้อมเพย์)</p>
                        {qrUrl ? ( 
                            <div className="flex flex-col items-center"> 
                                <img src={qrUrl} className="mx-auto border-2 border-gray-200 dark:border-gray-600 rounded-xl mb-3 shadow-sm p-2 bg-white" alt="QR Code" style={{ width: '200px', height: '200px' }} /> 
                                <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mt-1"> แคปหน้าจอหรือกดค้างเพื่อบันทึก</p> 
                            </div> 
                        ) : ( <div className="h-[200px] flex items-center justify-center text-gray-400">กำลังสร้าง QR Code...</div> )}
                        <div className="mt-4 bg-gray-50 dark:bg-gray-700 p-2 rounded"> <p className="text-sm font-bold text-gray-800 dark:text-white">{PROMPTPAY_NAME}</p> <p className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">{PROMPTPAY_PHONE}</p> </div>
                    </div>
                    
                    <div className="mb-4"> <label className="block mb-1 text-sm dark:text-gray-300">สลิปโอนเงิน <span className="text-red-500">*</span></label> <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files[0]; if (f) { try { const resizedBase64 = await compressImage(f); setSlipImg(resizedBase64); } catch (err) { setModalAlert({ show: true, type: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถประมวลผลรูปภาพได้' }); } } }} className="w-full text-sm dark:text-gray-300" /> </div>
                    <div className="flex items-start gap-2 mb-4 text-xs text-gray-600 dark:text-gray-400"> <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} /> <p>ฉันอ่านกฎระเบียบและยอมรับเงื่อนไขของ ขนำลุงดำ แคมป์ปิ้ง ทุกประการ </p> </div>
                    <button onClick={handleSubmit} disabled={loading || !canSubmit} className={`w-full p-3 rounded-lg font-bold text-white transition ${loading || !canSubmit ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg'}`}>{loading ? 'กำลังยืนยันการจอง...' : 'ยืนยันการจองที่พัก'}</button>
                </div>
            )}

            {mode === 'booking' && step === 5 && (
                <div className="max-w-md mx-auto p-8 text-center bg-white dark:bg-gray-800 shadow-xl rounded-xl mt-10">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500 text-4xl shadow-inner animate-pop"><i className="fas fa-check"></i></div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">จองสำเร็จ!</h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">รหัสการจอง: <span className="font-bold text-green-600">{bookingResult}</span></p>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-sm text-gray-700 dark:text-gray-300 mb-6">
                        ระบบได้ส่งข้อมูลการจองไปที่ LINE ของท่านแล้ว<br/>แอดมินจะตรวจสอบสลิปและอัปเดตสถานะเร็วๆ นี้ครับ
                    </div>
                    <button onClick={() => window.location.reload()} className="w-full bg-gray-800 dark:bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition font-bold shadow">กลับหน้าแรก</button>
                </div>
            )}

            {/* --- MODALS --- */}
            {selectedFood && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm relative animate-pop overflow-hidden">
                        <button onClick={() => setSelectedFood(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm"><i className="fas fa-times text-lg"></i></button>
                        <div className="w-full h-48 -mt-6 -mx-6 mb-4 relative"><img src={selectedFood.img} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div></div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">{selectedFood.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 h-10 overflow-y-auto custom-scrollbar">{selectedFood.desc || 'ไม่มีคำอธิบาย'}</p>
                        <div className="flex items-center justify-between mb-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600">
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">{selectedFood.price} ฿ <span className="text-xs text-gray-500">/ ชุด</span></div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setFoodCount(Math.max(1, foodCount - 1))} className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-sm font-bold transition-colors">-</button>
                                <span className="text-lg font-bold w-6 text-center dark:text-white">{foodCount}</span>
                                <button onClick={() => setFoodCount(foodCount + 1)} className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-sm font-bold transition-colors">+</button>
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <textarea 
                                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 outline-none" 
                                placeholder="หมายเหตุเพิ่มเติม (เช่น ไม่เผ็ด, เพิ่มไข่ดาว)..." 
                                rows="2"
                                value={foodNote}
                                onChange={(e) => setFoodNote(e.target.value)}
                            ></textarea>
                        </div>

                        <button onClick={confirmFoodSelection} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"><i className="fas fa-cart-plus"></i> เพิ่มลงตะกร้า</button>
                    </div>
                </div>
            )}
            
            {showRoomRequiredModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center relative animate-pop">
                        <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4"><i className="fas fa-campground text-3xl text-yellow-500 dark:text-yellow-300"></i></div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">กรุณาเลือกที่พัก</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">คุณต้องเลือกห้องพักหรือลานกางเต็นท์อย่างน้อย 1 รายการก่อนดำเนินการต่อครับ</p>
                        <button onClick={() => setShowRoomRequiredModal(false)} className="w-full bg-yellow-500 text-white py-3 rounded-xl font-bold hover:bg-yellow-600 transition shadow">รับทราบ</button>
                    </div>
                </div>
            )}
            
            {closedModal && ( <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6"> <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center relative animate-pop"> <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4"> <i className="fas fa-ban text-3xl text-red-500 dark:text-red-300"></i> </div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">วันปิดให้บริการ</h3> <p className="text-gray-600 dark:text-gray-300 mb-1">วันที่ <strong>{formatThaiDate(closedModal.date)}</strong></p> <p className="text-red-500 dark:text-red-400 font-medium mb-6">"{closedModal.reason}"</p> <button onClick={() => setClosedModal(null)} className="w-full bg-gray-800 dark:bg-gray-600 text-white py-3 rounded-xl font-bold hover:bg-gray-700 transition">เลือกวันใหม่</button> </div> </div> )}
            
            {searchError && ( <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6"> <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center relative animate-pop"> <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4"> <i className="fas fa-exclamation-triangle text-3xl text-yellow-500 dark:text-yellow-300"></i> </div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">แจ้งเตือน</h3> <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">{searchError}</p> <button onClick={() => setSearchError(null)} className="w-full bg-yellow-500 text-white py-3 rounded-xl font-bold hover:bg-yellow-600 transition">ตกลง</button> </div> </div> )}
            
            {modalAlert.show && ( <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm transition-opacity"> <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-pop"> <div className={`p-6 text-center ${modalAlert.type==='error'?'bg-red-50 dark:bg-red-900/20':''}`}> <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${modalAlert.type==='error'?'bg-red-100 text-red-500': modalAlert.type==='success'?'bg-green-100 text-green-500':'bg-yellow-100 text-yellow-500'}`}> <i className={`fas ${modalAlert.type==='error'?'fa-times':modalAlert.type==='success'?'fa-check':'fa-exclamation'} text-2xl`}></i> </div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{modalAlert.title}</h3> <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{modalAlert.text}</p> </div> <div className="p-4 bg-gray-50 dark:bg-gray-700"> <button onClick={() => setModalAlert({ ...modalAlert, show: false })} className="w-full py-2.5 bg-gray-800 dark:bg-gray-600 text-white rounded-xl font-bold hover:bg-gray-700 transition">ตกลง</button> </div> </div> </div> )}
            
            {modalConfirm.show && ( <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm transition-opacity"> <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-pop"> <div className="p-6 text-center"> <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-100 text-blue-500"> <i className="fas fa-question text-3xl"></i> </div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{modalConfirm.title}</h3> <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{modalConfirm.text}</p> </div> <div className="p-4 bg-gray-50 dark:bg-gray-700 flex gap-2"> <button onClick={() => setModalConfirm({ ...modalConfirm, show: false })} className="flex-1 py-2.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-50 transition">ยกเลิก</button> <button onClick={modalConfirm.onConfirm} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow">ยืนยัน</button> </div> </div> </div> )}

            {/* --- CAMPING LOADING OVERLAY --- */}
            {(loading || isInitializing) && <CampingLoaderOverlay text={isInitializing ? "กำลังเตรียมพื้นที่กางเต็นท์..." : "กำลังดำเนินการ..."} />}
        </div>
    );
}

export default function App() {
    const [currentPath, setCurrentPath] = useState(window.location.pathname);

    useEffect(() => {
        const handleLocationChange = () => setCurrentPath(window.location.pathname);
        window.addEventListener('popstate', handleLocationChange);
        return () => window.removeEventListener('popstate', handleLocationChange);
    }, []);

    if (currentPath.startsWith('/admin')) {
        return <AdminApp />;
    }
    return <CustomerApp />;
}