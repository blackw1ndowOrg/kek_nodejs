require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateSchedule } = require('../src/domain/schedule');

const prisma = new PrismaClient();

// ==========================================
// 1. КОНСТАНТИ ТА ДАНІ ДЛЯ НАПОВНЕННЯ
// Усі суми в системі зберігаються в копійках!
// ==========================================
const SETTINGS = {
  tuitionMonthly: 1500000, // 15 000 грн/міс
  yearlyDiscountPercent: 12, // знижка за оплату на рік (не діє на харчування)
  discountLevels: [10, 20, 30], // пільги на навчання
  mealBasePerDay: 30000, // 300 грн/день для 2-річних
  mealPerExtraYear: 10000, // +100 грн/день за кожен наступний рік
  roomMonthlyCost: 5000000, // 50 000 грн/міс
  defaultRoomsCount: 20,
  maxChildrenInGroup: 20,
  maxGroups: 30,
  groupExtraPayThreshold: 12, // поріг доплати після (доплати починаються після 12 дітей у групі)
  educatorPerChild: 200000, // 2 000 грн за дитину
  educatorExtraPay: 300000, // +3 000 грн після порогу
  assistantSalary: 2000000, // 20 000 грн фіксована
  assistantExtraPay: 300000, // +3 000 грн після порогу
  clubTeacherSalary: 4000000, // 40 000 грн
  managerSalary: 8000000, // 80 000 грн
};

// Список кімнат (кабінети гуртків та групові приміщення)
const ROOMS_DATA = [
  // Кабінети гуртків
  { name: 'Кабінет Музика', type: 'CLUB' },
  { name: 'Кабінет Англійська', type: 'CLUB' },
  { name: 'Кабінет Шахи', type: 'CLUB' },
  { name: 'Кабінет Малювання', type: 'CLUB' },
  { name: 'Кабінет Танці', type: 'CLUB' },
  // Кімнати груп
  { name: 'Кімната Сонечко', type: 'GROUP' },
  { name: 'Кімната Дзвіночок', type: 'GROUP' },
  { name: 'Кімната Чомусики', type: 'GROUP' },
  { name: 'Кімната Пізнайки', type: 'GROUP' },
];

// Користувачі для всіх системних ролей
const USERS_DATA = [
  // Менеджер
  { email: 'manager@kindergarten.local', role: 'MANAGER' },
  // Викладачі гуртків
  { email: 'teacher.music@kindergarten.local', role: 'TEACHER' },
  { email: 'teacher.english@kindergarten.local', role: 'TEACHER' },
  { email: 'teacher.chess@kindergarten.local', role: 'TEACHER' },
  { email: 'teacher.art@kindergarten.local', role: 'TEACHER' },
  { email: 'teacher.dance@kindergarten.local', role: 'TEACHER' },
  // Вихователі
  { email: 'educator.sonechko@kindergarten.local', role: 'TEACHER' },
  { email: 'educator.dzvinochok@kindergarten.local', role: 'TEACHER' },
  { email: 'educator.chomusyky@kindergarten.local', role: 'TEACHER' },
  { email: 'educator.piznayky@kindergarten.local', role: 'TEACHER' },
  // Помічники
  { email: 'assistant.sonechko@kindergarten.local', role: 'TEACHER' },
  { email: 'assistant.dzvinochok@kindergarten.local', role: 'TEACHER' },
  { email: 'assistant.chomusyky@kindergarten.local', role: 'TEACHER' },
  { email: 'assistant.piznayky@kindergarten.local', role: 'TEACHER' },
  // Батьки
  { email: 'parent.petrenko@example.com', role: 'PARENT' },
  { email: 'parent.sydorenko@example.com', role: 'PARENT' },
  { email: 'parent.koval@example.com', role: 'PARENT' },
  { email: 'parent.melnyk@example.com', role: 'PARENT' },
];

// Співробітники садка
const STAFF_DATA = [
  // Менеджер
  {
    fullName: 'Оксана Василенко',
    type: 'MANAGER',
    userEmail: 'manager@kindergarten.local',
  },
  // Викладачі гуртків
  {
    fullName: 'Ігор Лисенко',
    type: 'CLUB_TEACHER',
    userEmail: 'teacher.music@kindergarten.local',
  },
  {
    fullName: 'Сара Джонсон',
    type: 'CLUB_TEACHER',
    userEmail: 'teacher.english@kindergarten.local',
  },
  {
    fullName: 'Гаррі Каспаренко',
    type: 'CLUB_TEACHER',
    userEmail: 'teacher.chess@kindergarten.local',
  },
  {
    fullName: 'Катерина Білокур',
    type: 'CLUB_TEACHER',
    userEmail: 'teacher.art@kindergarten.local',
  },
  {
    fullName: 'Владислав Ямаченко',
    type: 'CLUB_TEACHER',
    userEmail: 'teacher.dance@kindergarten.local',
  },
  // Вихователі
  {
    fullName: 'Олена Коваленко',
    type: 'EDUCATOR',
    userEmail: 'educator.sonechko@kindergarten.local',
  },
  {
    fullName: 'Марія Шевченко',
    type: 'EDUCATOR',
    userEmail: 'educator.dzvinochok@kindergarten.local',
  },
  {
    fullName: 'Ірина Бойко',
    type: 'EDUCATOR',
    userEmail: 'educator.chomusyky@kindergarten.local',
  },
  {
    fullName: 'Наталія Кравченко',
    type: 'EDUCATOR',
    userEmail: 'educator.piznayky@kindergarten.local',
  },
  // Помічники вихователя
  {
    fullName: 'Світлана Мельник',
    type: 'ASSISTANT',
    userEmail: 'assistant.sonechko@kindergarten.local',
  },
  {
    fullName: 'Тетяна Бондар',
    type: 'ASSISTANT',
    userEmail: 'assistant.dzvinochok@kindergarten.local',
  },
  {
    fullName: 'Оксана Ткач',
    type: 'ASSISTANT',
    userEmail: 'assistant.chomusyky@kindergarten.local',
  },
  {
    fullName: 'Юлія Мороз',
    type: 'ASSISTANT',
    userEmail: 'assistant.piznayky@kindergarten.local',
  },
];

// Гуртки
const CLUBS_DATA = [
  {
    name: 'Музика',
    roomName: 'Кабінет Музика',
    teacherFullName: 'Ігор Лисенко',
  },
  {
    name: 'Англійська',
    roomName: 'Кабінет Англійська',
    teacherFullName: 'Сара Джонсон',
  },
  {
    name: 'Шахи',
    roomName: 'Кабінет Шахи',
    teacherFullName: 'Гаррі Каспаренко',
  },
  {
    name: 'Малювання',
    roomName: 'Кабінет Малювання',
    teacherFullName: 'Катерина Білокур',
  },
  {
    name: 'Танці',
    roomName: 'Кабінет Танці',
    teacherFullName: 'Владислав Ямаченко',
  },
];

// Вікові групи
const GROUPS_DATA = [
  {
    name: 'Сонечко',
    age: 2,
    roomName: 'Кімната Сонечко',
    educatorFullName: 'Олена Коваленко',
    assistantFullName: 'Світлана Мельник',
  },
  {
    name: 'Дзвіночок',
    age: 3,
    roomName: 'Кімната Дзвіночок',
    educatorFullName: 'Марія Шевченко',
    assistantFullName: 'Тетяна Бондар',
  },
  {
    name: 'Чомусики',
    age: 4,
    roomName: 'Кімната Чомусики',
    educatorFullName: 'Ірина Бойко',
    assistantFullName: 'Оксана Ткач',
  },
  {
    name: 'Пізнайки',
    age: 5,
    roomName: 'Кімната Пізнайки',
    educatorFullName: 'Наталія Кравченко',
    assistantFullName: 'Юлія Мороз',
  },
];

// Батьки
const PARENTS_DATA = [
  {
    userEmail: 'parent.petrenko@example.com',
    fullName: 'Петренко Василь Іванович',
    phone: '+380501112233',
    debt: 0,
  },
  {
    userEmail: 'parent.sydorenko@example.com',
    fullName: 'Сидоренко Віктор Миколайович',
    phone: '+380633334455',
    debt: 0, // Батько 2 дітей у садку (Софія та Матвій)
  },
  {
    userEmail: 'parent.koval@example.com',
    fullName: 'Коваль Андрій Сергійович',
    phone: '+380672223344',
    debt: 1500000, // Борг 15 000 грн
  },
  {
    userEmail: 'parent.melnyk@example.com',
    fullName: 'Мельник Ганна Петрівна',
    phone: '+380994445566',
    debt: 300000, // Борг 3 000 грн
  },
];

// Діти (покривають усі вікові категорії, пільги, родичів-депутатів та плани оплати)
const CHILDREN_DATA = [
  // --- Група «Сонечко» (вік 2 роки) ---
  {
    fullName: 'Петренко Максим Васильович',
    birthDate: new Date('2024-03-10'),
    groupName: 'Сонечко',
    notes: 'Не любить манну кашу, спить із ведмедиком',
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Сидоренко Софія Вікторівна',
    birthDate: new Date('2024-05-15'),
    groupName: 'Сонечко',
    notes: 'Алергія на цитрусові',
    discountPercent: 10,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-15'),
    isActive: true,
  },
  {
    fullName: 'Коваль Данило Андрійович',
    birthDate: new Date('2024-02-20'),
    groupName: 'Сонечко',
    notes: 'Полюбляє малювання',
    discountPercent: 20,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: true,
    paidUntil: new Date('2027-01-01'),
    isActive: true,
  },
  {
    fullName: 'Мельник Артем Олександрович',
    birthDate: new Date('2024-07-01'),
    groupName: 'Сонечко',
    notes: 'Алергія на лактозу',
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: null,
    isActive: true,
  },
  {
    fullName: 'Григоренко Єва Романівна',
    birthDate: new Date('2024-04-12'),
    groupName: 'Сонечко',
    notes: null,
    discountPercent: 30,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: true,
    paidUntil: new Date('2026-12-01'),
    isActive: true,
  },
  {
    fullName: 'Бондаренко Назар Олегович',
    birthDate: new Date('2024-06-25'),
    groupName: 'Сонечко',
    notes: 'Алергія на полуницю',
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-10-25'),
    isActive: false, // Неактивна дитина
  },

  // --- Група «Дзвіночок» (вік 3 роки) — 14 дітей для перевірки порогу >12 дітей та доплати +3 000 грн ---
  {
    fullName: 'Сидоренко Матвій Вікторович', // Старший брат Софії (той самий батько)
    birthDate: new Date('2023-04-10'),
    groupName: 'Дзвіночок',
    notes: 'Любить складати конструктори Lego',
    discountPercent: 10,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2027-02-01'),
    isActive: true,
  },
  {
    fullName: 'Кравчук Тимофій Ігорович',
    birthDate: new Date('2023-01-15'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Ткаченко Поліна Вадимівна',
    birthDate: new Date('2023-02-22'),
    groupName: 'Дзвіночок',
    notes: 'Вегетаріанське меню',
    discountPercent: 20,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: true,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Лисенко Денис Віталійович',
    birthDate: new Date('2023-03-05'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Морозова Анна Сергіївна',
    birthDate: new Date('2023-05-18'),
    groupName: 'Дзвіночок',
    notes: 'Не любить рибу',
    discountPercent: 30,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2027-03-01'),
    isActive: true,
  },
  {
    fullName: 'Марченко Богдан Павлович',
    birthDate: new Date('2023-06-30'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Шевчук Злата Дмитрівна',
    birthDate: new Date('2023-07-14'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 10,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Савченко Ярослав Олегович',
    birthDate: new Date('2023-08-09'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Руденко Аліса Артемівна',
    birthDate: new Date('2023-09-21'),
    groupName: 'Дзвіночок',
    notes: 'Чутлива до гучних звуків',
    discountPercent: 0,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2027-04-01'),
    isActive: true,
  },
  {
    fullName: 'Кузьменко Владислав Юрійович',
    birthDate: new Date('2023-10-11'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 20,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Пономаренко Марія Романівна',
    birthDate: new Date('2023-11-03'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Демченко Роман Тарасович',
    birthDate: new Date('2023-12-25'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Олійник Вікторія Василівна',
    birthDate: new Date('2023-04-02'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 30,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: true,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Павленко Ілля Андрійович',
    birthDate: new Date('2023-08-19'),
    groupName: 'Дзвіночок',
    notes: null,
    discountPercent: 10,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },

  // --- Група «Чомусики» (вік 4 роки) ---
  {
    fullName: 'Короленко Марко Сергійович',
    birthDate: new Date('2022-03-14'),
    groupName: 'Чомусики',
    notes: null,
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Захарченко Діана Олегівна',
    birthDate: new Date('2022-06-20'),
    groupName: 'Чомусики',
    notes: 'Алергія на горіхи',
    discountPercent: 20,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2027-01-01'),
    isActive: true,
  },

  // --- Група «Пізнайки» (вік 5 років) ---
  {
    fullName: 'Василенко Кирило Богданович',
    birthDate: new Date('2021-02-11'),
    groupName: 'Пізнайки',
    notes: 'Готується до школи',
    discountPercent: 0,
    paymentPlan: 'MONTHLY',
    hasDeputyRelatives: false,
    paidUntil: new Date('2026-11-01'),
    isActive: true,
  },
  {
    fullName: 'Федоренко Юлія Олександрівна',
    birthDate: new Date('2021-08-29'),
    groupName: 'Пізнайки',
    notes: null,
    discountPercent: 10,
    paymentPlan: 'YEARLY',
    hasDeputyRelatives: true,
    paidUntil: new Date('2027-01-01'),
    isActive: true,
  },
];

// Зв'язки родин: Батьки -> Діти
const PARENT_CHILD_DATA = [
  { parentEmail: 'parent.petrenko@example.com', childName: 'Петренко Максим Васильович' },
  // Сидоренко має двох дітей у різних групах:
  { parentEmail: 'parent.sydorenko@example.com', childName: 'Сидоренко Софія Вікторівна' },
  { parentEmail: 'parent.sydorenko@example.com', childName: 'Сидоренко Матвій Вікторович' },
  { parentEmail: 'parent.koval@example.com', childName: 'Коваль Данило Андрійович' },
  { parentEmail: 'parent.melnyk@example.com', childName: 'Мельник Артем Олександрович' },
];

// ===================================================================
// 2. ФУНКЦІЇ НАПОВНЕННЯ: КОЖНА ФУНКЦІЯ СТВОРЮЄ ТІЛЬКИ ОДНУ СУТНІСТЬ
// ===================================================================

/**
 * Сутність: Setting
 */
async function seedSettings() {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  console.log(`[1/10] Settings: ${Object.keys(SETTINGS).length}`);
}

/**
 * Сутність: Room
 */
async function seedRooms() {
  // Плавна міграція старих назв кімнат (якщо сід запускався раніше)
  const OLD_ROOM_NAMES = {
    'Кабінет гуртка: Музика': 'Кабінет Музика',
    'Кабінет гуртка: Англійська': 'Кабінет Англійська',
    'Кабінет гуртка: Шахи': 'Кабінет Шахи',
    'Кабінет гуртка: Малювання': 'Кабінет Малювання',
    'Кабінет гуртка: Танці': 'Кабінет Танці',
    'Кімната «Сонечко» (2 роки)': 'Кімната Сонечко',
    'Кімната «Дзвіночок» (3 роки)': 'Кімната Дзвіночок',
    'Кімната «Чомусики» (4 роки)': 'Кімната Чомусики',
    'Кімната «Пізнайки» (5 років)': 'Кімната Пізнайки',
  };
  for (const [oldName, newName] of Object.entries(OLD_ROOM_NAMES)) {
    const oldRoom = await prisma.room.findUnique({ where: { name: oldName } });
    if (oldRoom) {
      const targetExists = await prisma.room.findUnique({ where: { name: newName } });
      if (!targetExists) {
        await prisma.room.update({ where: { id: oldRoom.id }, data: { name: newName } });
      }
    }
  }

  for (const room of ROOMS_DATA) {
    await prisma.room.upsert({
      where: { name: room.name },
      update: { type: room.type, monthlyCost: SETTINGS.roomMonthlyCost },
      create: {
        name: room.name,
        type: room.type,
        monthlyCost: SETTINGS.roomMonthlyCost,
      },
    });
  }
  console.log(`[2/10] Rooms: ${ROOMS_DATA.length}`);
}

/**
 * Сутність: User
 */
async function seedUsers() {
  // Хешуємо паролі один раз для швидкодії
  const defaultPassword = process.env.SEED_USER_PASSWORD || 'Password123!';
  const defaultPasswordHash = await bcrypt.hash(defaultPassword, 10);
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@kindergarten.local';

  // 1. Admin
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  // 2. Решта користувачів (Manager, Teachers, Parents)
  for (const u of USERS_DATA) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: {
        email: u.email,
        passwordHash: defaultPasswordHash,
        role: u.role,
      },
    });
  }
  console.log(`[3/10] Users: ${USERS_DATA.length + 1} (Admin + staff + parents)`);
}

/**
 * Сутність: Staff
 */
async function seedStaff() {
  for (const staff of STAFF_DATA) {
    const user = await prisma.user.findUnique({
      where: { email: staff.userEmail },
    });
    if (!user) continue;

    const existingByUserId = await prisma.staff.findUnique({
      where: { userId: user.id },
    });

    if (existingByUserId) {
      await prisma.staff.update({
        where: { id: existingByUserId.id },
        data: { fullName: staff.fullName, type: staff.type },
      });
    } else {
      const existingByName = await prisma.staff.findFirst({
        where: { fullName: staff.fullName },
      });
      if (existingByName) {
        await prisma.staff.update({
          where: { id: existingByName.id },
          data: { userId: user.id, type: staff.type },
        });
      } else {
        await prisma.staff.create({
          data: {
            fullName: staff.fullName,
            type: staff.type,
            userId: user.id,
          },
        });
      }
    }
  }
  console.log(`[4/10] Staff: ${STAFF_DATA.length}`);
}

/**
 * Сутність: Club
 */
async function seedClubs() {
  for (const club of CLUBS_DATA) {
    const room = await prisma.room.findUnique({ where: { name: club.roomName } });
    const teacher = await prisma.staff.findFirst({
      where: { fullName: club.teacherFullName },
    });

    if (!room || !teacher) {
      console.warn(`Пропущено гурток ${club.name}: кімната або викладач не знайдено`);
      continue;
    }

    await prisma.club.upsert({
      where: { name: club.name },
      update: { roomId: room.id, teacherId: teacher.id },
      create: {
        name: club.name,
        roomId: room.id,
        teacherId: teacher.id,
      },
    });
  }
  console.log(`[5/10] Clubs: ${CLUBS_DATA.length}`);
}

/**
 * Сутність: Group
 */
async function seedGroups() {
  // Плавна міграція старих назв груп (якщо сід запускався раніше)
  const OLD_GROUP_NAMES = {
    'Ясельна група «Сонечко»': 'Сонечко',
    'Молодша група «Дзвіночок»': 'Дзвіночок',
    'Середня група «Чомусики»': 'Чомусики',
    'Старша група «Пізнайки»': 'Пізнайки',
  };
  for (const [oldName, newName] of Object.entries(OLD_GROUP_NAMES)) {
    const oldGroup = await prisma.group.findFirst({ where: { name: oldName } });
    if (oldGroup) {
      await prisma.group.update({ where: { id: oldGroup.id }, data: { name: newName } });
    }
  }

  for (const g of GROUPS_DATA) {
    const room = await prisma.room.findUnique({ where: { name: g.roomName } });
    const educator = await prisma.staff.findFirst({
      where: { fullName: g.educatorFullName },
    });
    const assistant = await prisma.staff.findFirst({
      where: { fullName: g.assistantFullName },
    });

    if (!room) {
      console.warn(`Пропущено групу ${g.name}: кімнату не знайдено`);
      continue;
    }

    const existingGroup = await prisma.group.findFirst({
      where: {
        OR: [{ name: g.name }, { roomId: room.id }],
      },
    });

    if (existingGroup) {
      await prisma.group.update({
        where: { id: existingGroup.id },
        data: {
          name: g.name,
          age: g.age,
          roomId: room.id,
          educatorId: educator ? educator.id : null,
          assistantId: assistant ? assistant.id : null,
        },
      });
    } else {
      await prisma.group.create({
        data: {
          name: g.name,
          age: g.age,
          roomId: room.id,
          educatorId: educator ? educator.id : null,
          assistantId: assistant ? assistant.id : null,
        },
      });
    }
  }
  console.log(`[6/10] Groups: ${GROUPS_DATA.length}`);
}

/**
 * Сутність: Parent
 */
async function seedParents() {
  for (const p of PARENTS_DATA) {
    const user = await prisma.user.findUnique({ where: { email: p.userEmail } });
    if (!user) {
      console.warn(`Пропущено профіль батьків ${p.fullName}: користувача не знайдено`);
      continue;
    }

    await prisma.parent.upsert({
      where: { userId: user.id },
      update: {
        fullName: p.fullName,
        phone: p.phone,
        debt: p.debt,
      },
      create: {
        userId: user.id,
        fullName: p.fullName,
        phone: p.phone,
        debt: p.debt,
      },
    });
  }
  console.log(`[7/10] Parents: ${PARENTS_DATA.length}`);
}

/**
 * Сутність: Child
 */
async function seedChildren() {
  for (const c of CHILDREN_DATA) {
    const group = await prisma.group.findFirst({ where: { name: c.groupName } });
    const existing = await prisma.child.findFirst({ where: { fullName: c.fullName } });

    if (existing) {
      await prisma.child.update({
        where: { id: existing.id },
        data: {
          birthDate: c.birthDate,
          notes: c.notes,
          discountPercent: c.discountPercent,
          paymentPlan: c.paymentPlan,
          hasDeputyRelatives: c.hasDeputyRelatives,
          paidUntil: c.paidUntil,
          isActive: c.isActive,
          groupId: group ? group.id : null,
        },
      });
    } else {
      await prisma.child.create({
        data: {
          fullName: c.fullName,
          birthDate: c.birthDate,
          notes: c.notes,
          discountPercent: c.discountPercent,
          paymentPlan: c.paymentPlan,
          hasDeputyRelatives: c.hasDeputyRelatives,
          paidUntil: c.paidUntil,
          isActive: c.isActive,
          groupId: group ? group.id : null,
        },
      });
    }
  }
  console.log(`[8/10] Children: ${CHILDREN_DATA.length}`);
}

/**
 * Сутність: ParentChild
 */
async function seedParentChild() {
  let linked = 0;
  for (const pc of PARENT_CHILD_DATA) {
    const user = await prisma.user.findUnique({ where: { email: pc.parentEmail } });
    if (!user) continue;

    const parent = await prisma.parent.findUnique({ where: { userId: user.id } });
    const child = await prisma.child.findFirst({ where: { fullName: pc.childName } });

    if (!parent || !child) continue;

    await prisma.parentChild.upsert({
      where: {
        parentId_childId: {
          parentId: parent.id,
          childId: child.id,
        },
      },
      update: {},
      create: {
        parentId: parent.id,
        childId: child.id,
      },
    });
    linked += 1;
  }
  console.log(`[9/10] ParentChild links: ${linked}`);
}

/**
 * Сутність: ScheduleSlot
 * Створює тижневий розклад для групи «Дзвіночок» згідно з бізнес-правилами:
 * 8-годинний день (08:30 - 16:30 = 510..990 хв)
 * 3 прийоми їжі по 30 хв (не підряд)
 * 1 год денного сну
 * 1 год прогулянки
 * 1.5 год вільного часу
 * 3 заняття на день, рівномірний розподіл між 5 гуртками по 3 на тиждень
 */
/**
 * Сутність: ScheduleSlot
 * Розклад для ВСІХ груп генерує domain-функція generateSchedule (той самий алгоритм, що й
 * POST /api/v1/schedule/generate): 08:30–16:30, 3 заняття по 45 хв на день, кожен гурток
 * у кожної групи рівно 3 рази на тиждень, жодних накладок кабінетів між групами.
 * Повторний запуск seed повністю перебудовує розклад (ручні правки замінюються).
 */
async function seedSchedule() {
  const [groups, clubs] = await Promise.all([
    prisma.group.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
    prisma.club.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
  ]);

  const slots = generateSchedule({ groups, clubs });
  await prisma.$transaction([
    prisma.scheduleSlot.deleteMany(),
    prisma.scheduleSlot.createMany({ data: slots }),
  ]);
  console.log(`[10/10] ScheduleSlots: ${slots.length} (${groups.length} груп × Пн–Пт)`);
}

// ==========================================
// 3. ТОЧКА ВХОДУ: ПОСЛІДОВНЕ ВИКОНАННЯ
// Порядок за графом залежностей сутностей
// ==========================================
async function main() {
  console.log('--- Початок наповнення бази даних (Seed) ---');
  await seedSettings();
  await seedRooms();
  await seedUsers();
  await seedStaff();
  await seedClubs();
  await seedGroups();
  await seedParents();
  await seedChildren();
  await seedParentChild();
  await seedSchedule();
  console.log('--- Наповнення бази даних успішно завершено! ---');
}

main()
  .catch((err) => {
    console.error('Помилка під час наповнення бази даних:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
