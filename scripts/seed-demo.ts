/**
 * Seed de demonstração — cria uma transportadora completa com motoristas,
 * frota, fretes, solicitações, rotas em andamento (com rastreamento GPS),
 * avaliações e notificações, para navegar no painel com tudo preenchido.
 *
 * Uso (banco local do docker compose):
 *   yarn seed:demo
 *
 * Credenciais criadas:
 *   CNPJ  45.723.174/0001-10
 *   Senha Demo@2026
 *
 * O script é idempotente: remove os dados de demo (ids com prefixo "demo-")
 * antes de recriá-los. Por segurança, só roda contra localhost, a menos que
 * SEED_ALLOW_REMOTE=true.
 */

import * as bcrypt from 'bcrypt';
import { connectionSource } from '../src/config/typeorm';
import { Company } from '../src/entities/company.entity';
import { SubscriptionCompany } from '../src/entities/subscription-company.entity';
import { PlansCompany } from '../src/entities/plans-company.entity';
import { UsersDrive } from '../src/entities/users-drive.entity';
import { Vehicle } from '../src/entities/vehicles.entity';
import { CompanyUsersContacts } from '../src/entities/company-users-contacts.entity';
import { ContactCompany } from '../src/entities/contact-company.entity';
import { ContactGroup } from '../src/entities/contact-group.entity';
import { Freight } from '../src/entities/freight.entity';
import {
  FreightRequest,
  FreightRequestStatus,
} from '../src/entities/freight-requests.entity';
import {
  FreightRoutes,
  RouteStatus,
} from '../src/entities/freight-routes.entity';
import {
  ReviewUserDrive,
  ReviewTags,
} from '../src/entities/review-users-drive.entity';
import {
  Notification,
  NotificationCategory,
  NotificationStatus,
  EntityType,
} from '../src/entities/notifications.entity';
import {
  FreightLocal,
  PaymentMethod,
  SpecieOfLoad,
  Toll,
  TypeOfLoad,
  UnityMetric,
} from '../src/enum/freight';
import { BodyType, VehicleType } from '../src/enum/vehicle';

const COMPANY_ID = 'demo-company-0000-0000-000000000001';
const COMPANY_CNPJ = '45.723.174/0001-10';
const COMPANY_PASSWORD = process.env.DEMO_COMPANY_PASSWORD;
const DEFAULT_PLAN_ID = '3f58f0d0-6b81-4af8-a1ef-0b3f34a46301';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const daysAhead = (days: number) => new Date(now.getTime() + days * DAY);
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);

interface CityPoint {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

const CITIES: Record<string, CityPoint> = {
  uberlandia: { city: 'Uberlândia', state: 'MG', lat: -18.9186, lng: -48.2772 },
  saopaulo: { city: 'São Paulo', state: 'SP', lat: -23.5505, lng: -46.6333 },
  ribeirao: {
    city: 'Ribeirão Preto',
    state: 'SP',
    lat: -21.1775,
    lng: -47.8103,
  },
  goiania: { city: 'Goiânia', state: 'GO', lat: -16.6869, lng: -49.2648 },
  curitiba: { city: 'Curitiba', state: 'PR', lat: -25.4284, lng: -49.2733 },
  bh: { city: 'Belo Horizonte', state: 'MG', lat: -19.9167, lng: -43.9345 },
  campinas: { city: 'Campinas', state: 'SP', lat: -22.9099, lng: -47.0626 },
  brasilia: { city: 'Brasília', state: 'DF', lat: -15.7939, lng: -47.8828 },
  rondonopolis: {
    city: 'Rondonópolis',
    state: 'MT',
    lat: -16.4673,
    lng: -54.6372,
  },
  salvador: { city: 'Salvador', state: 'BA', lat: -12.9714, lng: -38.5014 },
  recife: { city: 'Recife', state: 'PE', lat: -8.0476, lng: -34.877 },
  portoalegre: {
    city: 'Porto Alegre',
    state: 'RS',
    lat: -30.0346,
    lng: -51.2177,
  },
};

async function cleanup(): Promise<void> {
  const runner = connectionSource;
  // Ordem inversa de dependência; junction table primeiro.
  await runner.query(
    `DELETE FROM "contact-group-members" WHERE "groupId" LIKE 'demo-%' OR "contactId" LIKE 'demo-%'`,
  );
  const statements: Array<[string, unknown[]]> = [
    [
      `DELETE FROM reviews_user_drive WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM freight_route_locations WHERE id LIKE 'demo-%' OR "routeId" LIKE 'demo-%'`,
      [],
    ],
    [
      `DELETE FROM freight_routes WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM freight_requests WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM notifications WHERE "recipientId" = $1 OR "senderId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM "contact-group" WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM "company-users-contacts" WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM vehicles WHERE id LIKE 'demo-%' OR "userId" LIKE 'demo-%'`,
      [],
    ],
    [`DELETE FROM users_drive WHERE id LIKE 'demo-%'`, []],
    [
      `DELETE FROM freight WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM "contact-company" WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM "subscription-company" WHERE id LIKE 'demo-%' OR "companyId" = $1`,
      [COMPANY_ID],
    ],
    [
      `DELETE FROM company WHERE id = $1 OR cnpj = $2`,
      [COMPANY_ID, COMPANY_CNPJ],
    ],
  ];
  for (const [sql, params] of statements) {
    await runner.query(sql, params.length ? params : undefined);
  }
}

async function main(): Promise<void> {
  if (!COMPANY_PASSWORD || COMPANY_PASSWORD.length < 12) {
    throw new Error(
      'Defina DEMO_COMPANY_PASSWORD com pelo menos 12 caracteres antes de executar o seed',
    );
  }

  await connectionSource.initialize();

  const options = connectionSource.options as { host?: string };
  const host = options.host ?? '';
  const isLocal = ['localhost', '127.0.0.1', 'postgres'].includes(host);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'true') {
    throw new Error(
      `Host "${host}" não é local. Defina SEED_ALLOW_REMOTE=true para rodar contra banco remoto (cuidado!).`,
    );
  }
  console.log(`Seed de demo contra ${host}:${(options as any).port}`);

  await cleanup();
  console.log('Dados de demo anteriores removidos.');

  // ── Empresa (transportadora) ──────────────────────────────────────────────
  const companyRepo = connectionSource.getRepository(Company);
  const company = await companyRepo.save(
    companyRepo.create({
      id: COMPANY_ID,
      name: 'NFretes Demo Transportes LTDA',
      nameFantasy: 'NFretes Demo',
      email: 'demo@nfretes.com.br',
      phoneNumber: '+5534999990000',
      phoneContact: '(34) 99999-0000',
      cnpj: COMPANY_CNPJ,
      transportCategory: 'ETC — Empresa de Transporte de Cargas',
      password: await bcrypt.hash(COMPANY_PASSWORD, 10),
      isActive: true,
      isCompleted: true,
      isSucess: true,
      isOn: true,
      antt: 'RNTRC 12345678',
      zipcode: '38400-696',
      street: 'Av. Cesário Alvim',
      number: '3813',
      city: 'Uberlândia',
      state: 'MG',
      country: 'Brasil',
      district: 'Brasil',
    }),
  );

  // ── Assinatura ligada ao plano padrão ─────────────────────────────────────
  const planRepo = connectionSource.getRepository(PlansCompany);
  const plan =
    (await planRepo.findOne({ where: { id: DEFAULT_PLAN_ID } })) ??
    (await planRepo.findOne({ where: {} }));
  if (plan) {
    const subscriptionRepo =
      connectionSource.getRepository(SubscriptionCompany);
    await subscriptionRepo.save(
      subscriptionRepo.create({
        id: 'demo-subscription-000000000001',
        status: 1,
        planId: plan.id,
        companyId: company.id,
        amount: Number(plan.value ?? 0),
        interval: 1,
        isInTrial: false,
        trialStartDate: daysAgo(30),
        trialEndDate: daysAhead(335),
        nextRecurrency: daysAhead(30).toISOString(),
        endDate: daysAhead(30).toISOString(),
      }),
    );
  } else {
    console.warn('Nenhum plano encontrado — assinatura não criada.');
  }

  // ── Vendedores (contatos administrativos que publicam fretes) ────────────
  const sellerRepo = connectionSource.getRepository(ContactCompany);
  const sellers = [
    await sellerRepo.save(
      sellerRepo.create({
        id: 'demo-seller-ana',
        name: 'Ana Beatriz Souza',
        email: 'ana.demo@nfretes.com.br',
        phoneNumber: '+5534991230001',
        companyId: company.id,
        isActive: true,
      }),
    ),
    await sellerRepo.save(
      sellerRepo.create({
        id: 'demo-seller-carlos',
        name: 'Carlos Eduardo Ramos',
        email: 'carlos.demo@nfretes.com.br',
        phoneNumber: '+5534991230002',
        companyId: company.id,
        isActive: true,
      }),
    ),
  ];

  // ── Motoristas ────────────────────────────────────────────────────────────
  interface DriverSeed {
    key: string;
    name: string;
    cpf: string;
    phone: string;
    email: string;
    home: CityPoint;
    cnh: string;
    similiary: number;
    onRoute: boolean;
    vehicle: {
      type: VehicleType;
      body: BodyType;
      plate: string;
      year: number;
      capacity: number;
      tracker: boolean;
    };
  }

  const driverSeeds: DriverSeed[] = [
    {
      key: 'jailson',
      name: 'Jailson Costa',
      cpf: '412.658.390-01',
      phone: '+5534991110001',
      email: 'jailson.demo@nfretes.com.br',
      home: CITIES.uberlandia,
      cnh: '12345678900',
      similiary: 96.4,
      onRoute: true,
      vehicle: {
        type: VehicleType.BI_TRAIN,
        body: BodyType.BULK_CARRIER,
        plate: 'QNF2A18',
        year: 2021,
        capacity: 37000,
        tracker: true,
      },
    },
    {
      key: 'cleber',
      name: 'Cleber Nascimento',
      cpf: '318.204.576-02',
      phone: '+5516991110002',
      email: 'cleber.demo@nfretes.com.br',
      home: CITIES.ribeirao,
      cnh: '23456789011',
      similiary: 91.2,
      onRoute: true,
      vehicle: {
        type: VehicleType.TRUCK,
        body: BodyType.CHEST,
        plate: 'FRP7B22',
        year: 2019,
        capacity: 14000,
        tracker: true,
      },
    },
    {
      key: 'marcos',
      name: 'Marcos Vinícius Prado',
      cpf: '527.913.480-03',
      phone: '+5541991110003',
      email: 'marcos.demo@nfretes.com.br',
      home: CITIES.curitiba,
      cnh: '34567890122',
      similiary: 88.9,
      onRoute: true,
      vehicle: {
        type: VehicleType.TRUCK,
        body: BodyType.REFRIGERATED_CHEST,
        plate: 'BCW4C31',
        year: 2022,
        capacity: 16000,
        tracker: true,
      },
    },
    {
      key: 'rogerio',
      name: 'Rogério Tavares',
      cpf: '639.472.185-04',
      phone: '+5566991110004',
      email: 'rogerio.demo@nfretes.com.br',
      home: CITIES.rondonopolis,
      cnh: '45678901233',
      similiary: 94.1,
      onRoute: false,
      vehicle: {
        type: VehicleType.ROAD_TRAIN,
        body: BodyType.BULK_CARRIER,
        plate: 'NJK9D05',
        year: 2020,
        capacity: 48000,
        tracker: true,
      },
    },
    {
      key: 'sandra',
      name: 'Sandra Oliveira',
      cpf: '741.826.359-05',
      phone: '+5562991110005',
      email: 'sandra.demo@nfretes.com.br',
      home: CITIES.goiania,
      cnh: '56789012344',
      similiary: 97.8,
      onRoute: false,
      vehicle: {
        type: VehicleType.CART,
        body: BodyType.SIDER,
        plate: 'PQR3E77',
        year: 2023,
        capacity: 27000,
        tracker: true,
      },
    },
    {
      key: 'edson',
      name: 'Edson Ramalho',
      cpf: '852.194.637-06',
      phone: '+5538991110006',
      email: 'edson.demo@nfretes.com.br',
      home: CITIES.bh,
      cnh: '67890123455',
      similiary: 86.3,
      onRoute: false,
      vehicle: {
        type: VehicleType.BIT_TRUCK,
        body: BodyType.CHEST,
        plate: 'HGT6F44',
        year: 2018,
        capacity: 22000,
        tracker: false,
      },
    },
    {
      key: 'helio',
      name: 'Hélio Barbosa',
      cpf: '963.507.284-07',
      phone: '+5571991110007',
      email: 'helio.demo@nfretes.com.br',
      home: CITIES.salvador,
      cnh: '78901234566',
      similiary: 92.7,
      onRoute: false,
      vehicle: {
        type: VehicleType.CART_LS,
        body: BodyType.LOW_GRILLE,
        plate: 'OKP1G09',
        year: 2021,
        capacity: 32000,
        tracker: true,
      },
    },
    {
      key: 'patricia',
      name: 'Patrícia Lemos',
      cpf: '174.395.628-08',
      phone: '+5519991110008',
      email: 'patricia.demo@nfretes.com.br',
      home: CITIES.campinas,
      cnh: '89012345677',
      similiary: 95.5,
      onRoute: false,
      vehicle: {
        type: VehicleType.TOCO,
        body: BodyType.BOARD,
        plate: 'EZX8H51',
        year: 2020,
        capacity: 9000,
        tracker: true,
      },
    },
  ];

  const driverRepo = connectionSource.getRepository(UsersDrive);
  const vehicleRepo = connectionSource.getRepository(Vehicle);
  const drivers = new Map<string, UsersDrive>();

  for (const seed of driverSeeds) {
    const driver = await driverRepo.save(
      driverRepo.create({
        id: `demo-driver-${seed.key}`,
        name: seed.name,
        email: seed.email,
        phoneNumber: seed.phone,
        password: await bcrypt.hash(COMPANY_PASSWORD, 10),
        cpf: seed.cpf,
        city: seed.home.city,
        state: seed.home.state,
        country: 'Brasil',
        cnh: seed.cnh,
        antt: `RNTRC ${seed.cnh.slice(0, 8)}`,
        similiary: seed.similiary,
        isSucess: true,
        isOnRoute: seed.onRoute,
        lastAccess: hoursAgo(Math.floor(Math.random() * 48) + 1),
      }),
    );
    drivers.set(seed.key, driver);

    await vehicleRepo.save(
      vehicleRepo.create({
        id: `demo-vehicle-${seed.key}`,
        vehicleType: seed.vehicle.type,
        bodyType: seed.vehicle.body,
        plateNumber: seed.vehicle.plate,
        plateState: seed.home.state,
        renavam: `00${seed.cnh}`,
        year: seed.vehicle.year,
        color: 'Branco',
        isPlateValid: true,
        isRenavamValid: true,
        tracker: seed.vehicle.tracker,
        userId: driver.id,
        isMainVehicle: true,
        capacity: seed.vehicle.capacity,
        antt: `RNTRC ${seed.cnh.slice(0, 8)}`,
      }),
    );
  }

  // ── Carteira de contatos + grupos ────────────────────────────────────────
  const contactsRepo = connectionSource.getRepository(CompanyUsersContacts);
  const contactByDriver = new Map<string, CompanyUsersContacts>();
  for (const seed of driverSeeds) {
    const contact = await contactsRepo.save(
      contactsRepo.create({
        id: `demo-contact-${seed.key}`,
        companyId: company.id,
        userId: drivers.get(seed.key)!.id,
        isActive: true,
      }),
    );
    contactByDriver.set(seed.key, contact);
  }

  const groupRepo = connectionSource.getRepository(ContactGroup);
  await groupRepo.save(
    groupRepo.create({
      id: 'demo-group-sudeste',
      name: 'Rotas Sudeste',
      companyId: company.id,
      isActive: true,
      contacts: ['cleber', 'marcos', 'edson', 'patricia'].map(
        (key) => contactByDriver.get(key)!,
      ),
    }),
  );
  await groupRepo.save(
    groupRepo.create({
      id: 'demo-group-graneleiros',
      name: 'Graneleiros',
      companyId: company.id,
      isActive: true,
      contacts: ['jailson', 'rogerio', 'helio'].map(
        (key) => contactByDriver.get(key)!,
      ),
    }),
  );

  // ── Fretes ────────────────────────────────────────────────────────────────
  interface FreightSeed {
    key: string;
    origin: CityPoint;
    destiny: CityPoint;
    product: string;
    specie: SpecieOfLoad;
    weightKg: number;
    value: number;
    distanceKm: number;
    vehicleTypes: VehicleType[];
    bodyTypes: BodyType[];
    createdDaysAgo: number;
    departsInDays: number;
    durationDays: number;
    isActive: boolean;
    isFeatured?: boolean;
    openSolicitations?: boolean;
    tags?: string[];
  }

  const freightSeeds: FreightSeed[] = [
    // Abertos (recebendo solicitações)
    {
      key: 'soja-uberlandia-sp',
      origin: CITIES.uberlandia,
      destiny: CITIES.saopaulo,
      product: 'Soja a granel',
      specie: SpecieOfLoad.BULK,
      weightKg: 34000,
      value: 7800,
      distanceKm: 590,
      vehicleTypes: [VehicleType.BI_TRAIN, VehicleType.ROAD_TRAIN],
      bodyTypes: [BodyType.BULK_CARRIER],
      createdDaysAgo: 2,
      departsInDays: 2,
      durationDays: 2,
      isActive: true,
      isFeatured: true,
      tags: ['agro', 'urgente'],
    },
    {
      key: 'bebidas-sp-goiania',
      origin: CITIES.saopaulo,
      destiny: CITIES.goiania,
      product: 'Bebidas paletizadas',
      specie: SpecieOfLoad.PALLETS,
      weightKg: 24000,
      value: 6900,
      distanceKm: 930,
      vehicleTypes: [VehicleType.CART, VehicleType.TRUCK],
      bodyTypes: [BodyType.SIDER, BodyType.CHEST],
      createdDaysAgo: 1,
      departsInDays: 3,
      durationDays: 2,
      isActive: true,
      isFeatured: true,
      tags: ['bebidas'],
    },
    {
      key: 'fertilizante-rondonopolis-goiania',
      origin: CITIES.rondonopolis,
      destiny: CITIES.goiania,
      product: 'Fertilizante ensacado',
      specie: SpecieOfLoad.BAGS,
      weightKg: 30000,
      value: 5400,
      distanceKm: 700,
      vehicleTypes: [VehicleType.CART, VehicleType.BI_TRAIN],
      bodyTypes: [BodyType.BULK_CARRIER, BodyType.LOW_GRILLE],
      createdDaysAgo: 4,
      departsInDays: 5,
      durationDays: 2,
      isActive: true,
      tags: ['agro'],
    },
    {
      key: 'autopecas-campinas-curitiba',
      origin: CITIES.campinas,
      destiny: CITIES.curitiba,
      product: 'Autopeças em caixas',
      specie: SpecieOfLoad.BOX,
      weightKg: 11000,
      value: 4300,
      distanceKm: 480,
      vehicleTypes: [VehicleType.TRUCK, VehicleType.BIT_TRUCK],
      bodyTypes: [BodyType.CHEST, BodyType.SIDER],
      createdDaysAgo: 3,
      departsInDays: 4,
      durationDays: 1,
      isActive: true,
      tags: ['industrial'],
    },
    {
      key: 'algodao-brasilia-salvador',
      origin: CITIES.brasilia,
      destiny: CITIES.salvador,
      product: 'Fardos de algodão',
      specie: SpecieOfLoad.BALES,
      weightKg: 26000,
      value: 8600,
      distanceKm: 1440,
      vehicleTypes: [VehicleType.CART, VehicleType.CART_LS],
      bodyTypes: [BodyType.SIDER, BodyType.LOW_GRILLE],
      createdDaysAgo: 5,
      departsInDays: 6,
      durationDays: 3,
      isActive: true,
      tags: ['agro'],
    },
    // Em rota (openSolicitations fechado; rotas ativas criadas abaixo)
    {
      key: 'milho-uberlandia-ribeirao',
      origin: CITIES.uberlandia,
      destiny: CITIES.ribeirao,
      product: 'Milho a granel',
      specie: SpecieOfLoad.BULK,
      weightKg: 36000,
      value: 4900,
      distanceKm: 330,
      vehicleTypes: [VehicleType.BI_TRAIN],
      bodyTypes: [BodyType.BULK_CARRIER],
      createdDaysAgo: 6,
      departsInDays: -1,
      durationDays: 1,
      isActive: true,
      openSolicitations: false,
      tags: ['agro'],
    },
    {
      key: 'eletro-ribeirao-bh',
      origin: CITIES.ribeirao,
      destiny: CITIES.bh,
      product: 'Eletrodomésticos',
      specie: SpecieOfLoad.BOX,
      weightKg: 12000,
      value: 5200,
      distanceKm: 610,
      vehicleTypes: [VehicleType.TRUCK],
      bodyTypes: [BodyType.CHEST],
      createdDaysAgo: 5,
      departsInDays: -1,
      durationDays: 2,
      isActive: true,
      openSolicitations: false,
      tags: ['varejo'],
    },
    {
      key: 'frios-curitiba-sp',
      origin: CITIES.curitiba,
      destiny: CITIES.saopaulo,
      product: 'Carga refrigerada (frios)',
      specie: SpecieOfLoad.BOX,
      weightKg: 14000,
      value: 6100,
      distanceKm: 410,
      vehicleTypes: [VehicleType.TRUCK],
      bodyTypes: [BodyType.REFRIGERATED_CHEST],
      createdDaysAgo: 4,
      departsInDays: 0,
      durationDays: 1,
      isActive: true,
      openSolicitations: false,
      tags: ['refrigerada', 'urgente'],
    },
    // Concluídos (histórico para relatórios, espalhados nos últimos meses)
    {
      key: 'done-soja-1',
      origin: CITIES.uberlandia,
      destiny: CITIES.saopaulo,
      product: 'Soja a granel',
      specie: SpecieOfLoad.BULK,
      weightKg: 35000,
      value: 7500,
      distanceKm: 590,
      vehicleTypes: [VehicleType.BI_TRAIN],
      bodyTypes: [BodyType.BULK_CARRIER],
      createdDaysAgo: 150,
      departsInDays: -148,
      durationDays: 2,
      isActive: false,
      openSolicitations: false,
    },
    {
      key: 'done-cimento',
      origin: CITIES.bh,
      destiny: CITIES.brasilia,
      product: 'Cimento ensacado',
      specie: SpecieOfLoad.BAGS,
      weightKg: 28000,
      value: 6200,
      distanceKm: 740,
      vehicleTypes: [VehicleType.CART],
      bodyTypes: [BodyType.BULK_CARRIER],
      createdDaysAgo: 120,
      departsInDays: -118,
      durationDays: 2,
      isActive: false,
      openSolicitations: false,
    },
    {
      key: 'done-papel',
      origin: CITIES.curitiba,
      destiny: CITIES.campinas,
      product: 'Papel e celulose',
      specie: SpecieOfLoad.COIL,
      weightKg: 25000,
      value: 5100,
      distanceKm: 460,
      vehicleTypes: [VehicleType.CART],
      bodyTypes: [BodyType.SIDER],
      createdDaysAgo: 95,
      departsInDays: -93,
      durationDays: 1,
      isActive: false,
      openSolicitations: false,
    },
    {
      key: 'done-fracionada',
      origin: CITIES.saopaulo,
      destiny: CITIES.recife,
      product: 'Carga fracionada diversos',
      specie: SpecieOfLoad.FRACTIONAL,
      weightKg: 18000,
      value: 11800,
      distanceKm: 2660,
      vehicleTypes: [VehicleType.CART],
      bodyTypes: [BodyType.CHEST],
      createdDaysAgo: 70,
      departsInDays: -68,
      durationDays: 5,
      isActive: false,
      openSolicitations: false,
    },
    {
      key: 'done-bebidas',
      origin: CITIES.goiania,
      destiny: CITIES.uberlandia,
      product: 'Bebidas paletizadas',
      specie: SpecieOfLoad.PALLETS,
      weightKg: 22000,
      value: 3900,
      distanceKm: 350,
      vehicleTypes: [VehicleType.TRUCK, VehicleType.CART],
      bodyTypes: [BodyType.SIDER],
      createdDaysAgo: 45,
      departsInDays: -43,
      durationDays: 1,
      isActive: false,
      openSolicitations: false,
    },
    {
      key: 'done-moveis',
      origin: CITIES.saopaulo,
      destiny: CITIES.portoalegre,
      product: 'Móveis (mudança corporativa)',
      specie: SpecieOfLoad.CHANGES,
      weightKg: 9000,
      value: 7200,
      distanceKm: 1130,
      vehicleTypes: [VehicleType.TRUCK],
      bodyTypes: [BodyType.CHEST],
      createdDaysAgo: 20,
      departsInDays: -18,
      durationDays: 3,
      isActive: false,
      openSolicitations: false,
    },
    // Expirado (sem solicitações aprovadas)
    {
      key: 'expired-tambores',
      origin: CITIES.campinas,
      destiny: CITIES.goiania,
      product: 'Tambores de lubrificante',
      specie: SpecieOfLoad.DRUM,
      weightKg: 16000,
      value: 5600,
      distanceKm: 810,
      vehicleTypes: [VehicleType.TRUCK],
      bodyTypes: [BodyType.CHEST],
      createdDaysAgo: 30,
      departsInDays: -12,
      durationDays: 2,
      isActive: false,
      openSolicitations: false,
    },
  ];

  const freightRepo = connectionSource.getRepository(Freight);
  const freights = new Map<string, Freight>();
  for (const [freightIndex, seed] of freightSeeds.entries()) {
    const freight = await freightRepo.save(
      freightRepo.create({
        id: `demo-freight-${seed.key}`,
        contactCompanyId: sellers[freightIndex % sellers.length].id,
        shippingLocation: FreightLocal.NATIONAL,
        originCity: seed.origin.city,
        originState: seed.origin.state,
        originLatitude: String(seed.origin.lat),
        originLongitude: String(seed.origin.lng),
        destinyCity: seed.destiny.city,
        destinyState: seed.destiny.state,
        destinyLatitude: String(seed.destiny.lat),
        destinyLongitude: String(seed.destiny.lng),
        dateOrigin: daysAhead(seed.departsInDays),
        dateReceiver: daysAhead(seed.departsInDays + seed.durationDays),
        typeOfLoad: TypeOfLoad.COMPLETE,
        product: seed.product,
        specieOfLoad: seed.specie,
        weightOfLoad: String(seed.weightKg),
        unityMetric: UnityMetric.BYWEIGHT,
        vehicleTypes: seed.vehicleTypes,
        bodyTypes: seed.bodyTypes,
        Valuefreight: seed.value,
        valueAdvance: Math.round(seed.value * 0.3),
        calValue: PaymentMethod.VALORCONFIRMED,
        Toll: Toll.INCLUEDVALUE,
        methodPayment: 'Pix na entrega',
        observation: 'Carga de demonstração gerada pelo seed.',
        isActive: seed.isActive,
        openSolicitations: seed.openSolicitations ?? seed.isActive,
        companyId: company.id,
        tags: seed.tags ?? [],
        distance: `${seed.distanceKm} km`,
        lona: true,
        tracker: true,
        security: true,
        isPublic: true,
        isFeatured: seed.isFeatured ?? false,
        isToShare: true,
        expiresAt: daysAhead(seed.departsInDays + seed.durationDays + 2),
      }),
    );
    freights.set(seed.key, freight);
    // Espalha o createdAt para alimentar os gráficos por mês
    await connectionSource.query(
      `UPDATE freight SET "createdAt" = $1 WHERE id = $2`,
      [daysAgo(seed.createdDaysAgo), freight.id],
    );
  }

  // ── Solicitações de frete ────────────────────────────────────────────────
  interface RequestSeed {
    key: string;
    freight: string;
    driver: string;
    status: FreightRequestStatus;
    createdDaysAgo: number;
    order?: number;
  }

  const requestSeeds: RequestSeed[] = [
    // Pendentes (aparecem no dashboard como solicitações a responder)
    {
      key: 'p1',
      freight: 'soja-uberlandia-sp',
      driver: 'rogerio',
      status: FreightRequestStatus.PENDING,
      createdDaysAgo: 1,
      order: 1,
    },
    {
      key: 'p2',
      freight: 'soja-uberlandia-sp',
      driver: 'helio',
      status: FreightRequestStatus.PENDING,
      createdDaysAgo: 1,
      order: 2,
    },
    {
      key: 'p3',
      freight: 'bebidas-sp-goiania',
      driver: 'sandra',
      status: FreightRequestStatus.PENDING,
      createdDaysAgo: 0,
      order: 1,
    },
    {
      key: 'p4',
      freight: 'autopecas-campinas-curitiba',
      driver: 'patricia',
      status: FreightRequestStatus.PENDING,
      createdDaysAgo: 2,
      order: 1,
    },
    {
      key: 'p5',
      freight: 'fertilizante-rondonopolis-goiania',
      driver: 'rogerio',
      status: FreightRequestStatus.PENDING,
      createdDaysAgo: 3,
      order: 1,
    },
    // Aguardando resposta do motorista (empresa indicou)
    {
      key: 'w1',
      freight: 'algodao-brasilia-salvador',
      driver: 'helio',
      status: FreightRequestStatus.AWAITING_USER_DRIVE_RESPONSE,
      createdDaysAgo: 1,
    },
    // Rejeitada
    {
      key: 'r1',
      freight: 'bebidas-sp-goiania',
      driver: 'edson',
      status: FreightRequestStatus.REJECTED,
      createdDaysAgo: 1,
    },
    // Aceitas (fretes em rota)
    {
      key: 'a1',
      freight: 'milho-uberlandia-ribeirao',
      driver: 'jailson',
      status: FreightRequestStatus.ACCEPTED,
      createdDaysAgo: 2,
    },
    {
      key: 'a2',
      freight: 'eletro-ribeirao-bh',
      driver: 'cleber',
      status: FreightRequestStatus.ACCEPTED,
      createdDaysAgo: 2,
    },
    {
      key: 'a3',
      freight: 'frios-curitiba-sp',
      driver: 'marcos',
      status: FreightRequestStatus.ACCEPTED,
      createdDaysAgo: 1,
    },
    // Entregues (histórico)
    {
      key: 'd1',
      freight: 'done-soja-1',
      driver: 'jailson',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 149,
    },
    {
      key: 'd2',
      freight: 'done-cimento',
      driver: 'rogerio',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 119,
    },
    {
      key: 'd3',
      freight: 'done-papel',
      driver: 'sandra',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 94,
    },
    {
      key: 'd4',
      freight: 'done-fracionada',
      driver: 'helio',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 69,
    },
    {
      key: 'd5',
      freight: 'done-bebidas',
      driver: 'edson',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 44,
    },
    {
      key: 'd6',
      freight: 'done-moveis',
      driver: 'patricia',
      status: FreightRequestStatus.DELIVERY_COMPLETED,
      createdDaysAgo: 19,
    },
  ];

  const requestRepo = connectionSource.getRepository(FreightRequest);
  for (const seed of requestSeeds) {
    const request = await requestRepo.save(
      requestRepo.create({
        id: `demo-request-${seed.key}`,
        freightId: freights.get(seed.freight)!.id,
        userDriveId: drivers.get(seed.driver)!.id,
        companyId: company.id,
        status: seed.status,
        solicitationsOrder: seed.order ?? 0,
        expiresAt:
          seed.status === FreightRequestStatus.PENDING ? daysAhead(2) : null,
      }),
    );
    await connectionSource.query(
      `UPDATE freight_requests SET "createdAt" = $1 WHERE id = $2`,
      [daysAgo(seed.createdDaysAgo), request.id],
    );
  }

  // ── Rotas (monitoramento) ────────────────────────────────────────────────
  interface RouteSeed {
    key: string;
    freight: string;
    driver: string;
    status: RouteStatus;
    startedDaysAgo: number;
    completedDaysAgo?: number;
    /** Progresso da viagem (0-1) para gerar o trajeto GPS. */
    progress?: number;
  }

  const routeSeeds: RouteSeed[] = [
    {
      key: 'live-milho',
      freight: 'milho-uberlandia-ribeirao',
      driver: 'jailson',
      status: RouteStatus.IN_PROGRESS,
      startedDaysAgo: 1,
      progress: 0.72,
    },
    {
      key: 'live-eletro',
      freight: 'eletro-ribeirao-bh',
      driver: 'cleber',
      status: RouteStatus.IN_PROGRESS,
      startedDaysAgo: 1,
      progress: 0.45,
    },
    {
      key: 'live-frios',
      freight: 'frios-curitiba-sp',
      driver: 'marcos',
      status: RouteStatus.IN_PROGRESS,
      startedDaysAgo: 0,
      progress: 0.2,
    },
    {
      key: 'done-soja-1',
      freight: 'done-soja-1',
      driver: 'jailson',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 148,
      completedDaysAgo: 146,
    },
    {
      key: 'done-cimento',
      freight: 'done-cimento',
      driver: 'rogerio',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 118,
      completedDaysAgo: 116,
    },
    {
      key: 'done-papel',
      freight: 'done-papel',
      driver: 'sandra',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 93,
      completedDaysAgo: 92,
    },
    {
      key: 'done-fracionada',
      freight: 'done-fracionada',
      driver: 'helio',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 68,
      completedDaysAgo: 63,
    },
    {
      key: 'done-bebidas',
      freight: 'done-bebidas',
      driver: 'edson',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 43,
      completedDaysAgo: 42,
    },
    {
      key: 'done-moveis',
      freight: 'done-moveis',
      driver: 'patricia',
      status: RouteStatus.COMPLETED,
      startedDaysAgo: 18,
      completedDaysAgo: 15,
    },
  ];

  const routeRepo = connectionSource.getRepository(FreightRoutes);
  const routes = new Map<string, FreightRoutes>();
  for (const seed of routeSeeds) {
    const isDone = seed.status === RouteStatus.COMPLETED;
    const route = await routeRepo.save(
      routeRepo.create({
        id: `demo-route-${seed.key}`,
        freightId: freights.get(seed.freight)!.id,
        userDriveId: drivers.get(seed.driver)!.id,
        companyId: company.id,
        status: seed.status,
        isActive: !isDone,
        avalationCompany: isDone,
        avalationUserDrive: isDone,
      }),
    );
    routes.set(seed.key, route);
    await connectionSource.query(
      `UPDATE freight_routes SET "startedAt" = $1, "completedAt" = $2 WHERE id = $3`,
      [
        daysAgo(seed.startedDaysAgo),
        daysAgo(seed.completedDaysAgo ?? 0),
        route.id,
      ],
    );
  }

  // ── Rastreamento GPS das rotas em andamento ──────────────────────────────
  const POINTS_PER_ROUTE = 14;
  for (const seed of routeSeeds) {
    if (seed.status !== RouteStatus.IN_PROGRESS) continue;
    const freightSeed = freightSeeds.find((f) => f.key === seed.freight)!;
    const route = routes.get(seed.key)!;
    const progress = seed.progress ?? 0.5;
    const startedAt = daysAgo(seed.startedDaysAgo);
    const elapsedMs = now.getTime() - startedAt.getTime();

    for (let i = 0; i < POINTS_PER_ROUTE; i++) {
      const t = (i / (POINTS_PER_ROUTE - 1)) * progress;
      // Interpolação com leve curvatura para o trajeto não ser uma reta perfeita
      const wobble = Math.sin(t * Math.PI) * 0.18;
      const lat =
        freightSeed.origin.lat +
        (freightSeed.destiny.lat - freightSeed.origin.lat) * t +
        wobble * 0.15;
      const lng =
        freightSeed.origin.lng +
        (freightSeed.destiny.lng - freightSeed.origin.lng) * t -
        wobble * 0.2;
      const timestamp = new Date(
        startedAt.getTime() + (elapsedMs * i) / (POINTS_PER_ROUTE - 1),
      );
      await connectionSource.query(
        `INSERT INTO freight_route_locations (id, latitude, longitude, address, city, state, timestamp, "routeId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `demo-location-${seed.key}-${i}`,
          lat.toFixed(8),
          lng.toFixed(8),
          i === POINTS_PER_ROUTE - 1 ? 'Posição atual' : `BR — ponto ${i + 1}`,
          i === 0 ? freightSeed.origin.city : '',
          i === 0 ? freightSeed.origin.state : '',
          timestamp,
          route.id,
        ],
      );
    }
  }

  // ── Avaliações (empresa ↔ motorista) ─────────────────────────────────────
  interface ReviewSeed {
    key: string;
    route: string;
    freight: string;
    driver: string;
    byCompany: boolean;
    rating: number;
    comment: string;
    tags: ReviewTags[];
    createdDaysAgo: number;
  }

  const reviewSeeds: ReviewSeed[] = [
    {
      key: 'c1',
      route: 'done-soja-1',
      freight: 'done-soja-1',
      driver: 'jailson',
      byCompany: true,
      rating: 5,
      comment:
        'Entrega antes do prazo e comunicação impecável durante toda a viagem.',
      tags: [
        ReviewTags.PONTUAL,
        ReviewTags.BOA_COMUNICACAO,
        ReviewTags.OTIMO_MOTORISTA,
      ],
      createdDaysAgo: 146,
    },
    {
      key: 'u1',
      route: 'done-soja-1',
      freight: 'done-soja-1',
      driver: 'jailson',
      byCompany: false,
      rating: 5,
      comment:
        'Carga bem organizada no embarque e pagamento na data combinada.',
      tags: [ReviewTags.MUITO_CONFIAVEL, ReviewTags.RESPONDE_RAPIDO],
      createdDaysAgo: 146,
    },
    {
      key: 'c2',
      route: 'done-cimento',
      freight: 'done-cimento',
      driver: 'rogerio',
      byCompany: true,
      rating: 5,
      comment: 'Motorista experiente, veículo em ótimo estado. Recomendo.',
      tags: [ReviewTags.VEICULO_BOM_ESTADO, ReviewTags.MUITO_CONFIAVEL],
      createdDaysAgo: 116,
    },
    {
      key: 'u2',
      route: 'done-cimento',
      freight: 'done-cimento',
      driver: 'rogerio',
      byCompany: false,
      rating: 4,
      comment:
        'Tudo certo com a operação, só o pátio de carregamento estava cheio.',
      tags: [ReviewTags.BOA_COMUNICACAO],
      createdDaysAgo: 116,
    },
    {
      key: 'c3',
      route: 'done-papel',
      freight: 'done-papel',
      driver: 'sandra',
      byCompany: true,
      rating: 5,
      comment: 'Pontualidade exemplar e cuidado com a carga de bobinas.',
      tags: [ReviewTags.ENTREGA_NO_PRAZO, ReviewTags.EDUCADO],
      createdDaysAgo: 92,
    },
    {
      key: 'c4',
      route: 'done-fracionada',
      freight: 'done-fracionada',
      driver: 'helio',
      byCompany: true,
      rating: 4,
      comment: 'Viagem longa concluída sem ocorrências. Comunicação boa.',
      tags: [ReviewTags.BOA_COMUNICACAO, ReviewTags.CUMPRE_HORARIO],
      createdDaysAgo: 63,
    },
    {
      key: 'c5',
      route: 'done-bebidas',
      freight: 'done-bebidas',
      driver: 'edson',
      byCompany: true,
      rating: 3,
      comment:
        'Entregou com algumas horas de atraso, mas avisou com antecedência.',
      tags: [ReviewTags.ATRASO_NA_ENTREGA, ReviewTags.BOA_COMUNICACAO],
      createdDaysAgo: 42,
    },
    {
      key: 'u5',
      route: 'done-bebidas',
      freight: 'done-bebidas',
      driver: 'edson',
      byCompany: false,
      rating: 4,
      comment: 'Empresa organizada, descarga rápida.',
      tags: [ReviewTags.MUITO_CONFIAVEL],
      createdDaysAgo: 42,
    },
    {
      key: 'c6',
      route: 'done-moveis',
      freight: 'done-moveis',
      driver: 'patricia',
      byCompany: true,
      rating: 5,
      comment:
        'Cuidado excepcional com a mudança corporativa. Cliente elogiou.',
      tags: [
        ReviewTags.OTIMO_MOTORISTA,
        ReviewTags.EDUCADO,
        ReviewTags.ENTREGA_NO_PRAZO,
      ],
      createdDaysAgo: 15,
    },
    {
      key: 'u6',
      route: 'done-moveis',
      freight: 'done-moveis',
      driver: 'patricia',
      byCompany: false,
      rating: 5,
      comment: 'Comunicação clara do início ao fim. Voltaria a rodar com eles.',
      tags: [ReviewTags.RESPONDE_RAPIDO, ReviewTags.MUITO_CONFIAVEL],
      createdDaysAgo: 15,
    },
  ];

  const reviewRepo = connectionSource.getRepository(ReviewUserDrive);
  for (const seed of reviewSeeds) {
    const review = await reviewRepo.save(
      reviewRepo.create({
        id: `demo-review-${seed.key}`,
        freightId: freights.get(seed.freight)!.id,
        userDriveId: drivers.get(seed.driver)!.id,
        companyId: company.id,
        routeId: routes.get(seed.route)!.id,
        isCompanyReviewingUser: seed.byCompany,
        isUserReviewingCompany: !seed.byCompany,
        rating: seed.rating,
        comment: seed.comment,
        tags: seed.tags,
      }),
    );
    await connectionSource.query(
      `UPDATE reviews_user_drive SET "createdAt" = $1 WHERE id = $2`,
      [daysAgo(seed.createdDaysAgo), review.id],
    );
  }

  // ── Notificações ─────────────────────────────────────────────────────────
  interface NotificationSeed {
    title: string;
    message: string;
    category: NotificationCategory;
    iconStyle: string;
    senderId: string;
    senderType: EntityType;
    read: boolean;
    hoursAgo: number;
    relatedType?: string;
    relatedId?: string;
  }

  const notificationSeeds: NotificationSeed[] = [
    {
      title: 'Nova solicitação de frete',
      message:
        'Rogério Tavares solicitou o frete Uberlândia → São Paulo (Soja a granel).',
      category: NotificationCategory.FREIGHT,
      iconStyle: 'freightRequest',
      senderId: drivers.get('rogerio')!.id,
      senderType: EntityType.USER,
      read: false,
      hoursAgo: 3,
      relatedType: 'freight',
      relatedId: freights.get('soja-uberlandia-sp')!.id,
    },
    {
      title: 'Nova solicitação de frete',
      message:
        'Sandra Oliveira solicitou o frete São Paulo → Goiânia (Bebidas).',
      category: NotificationCategory.FREIGHT,
      iconStyle: 'freightRequest',
      senderId: drivers.get('sandra')!.id,
      senderType: EntityType.USER,
      read: false,
      hoursAgo: 6,
      relatedType: 'freight',
      relatedId: freights.get('bebidas-sp-goiania')!.id,
    },
    {
      title: 'Motorista a caminho',
      message: 'Jailson Costa iniciou a rota Uberlândia → Ribeirão Preto.',
      category: NotificationCategory.FREIGHT,
      iconStyle: 'freightAccepted',
      senderId: drivers.get('jailson')!.id,
      senderType: EntityType.USER,
      read: false,
      hoursAgo: 20,
      relatedType: 'route',
      relatedId: routes.get('live-milho')!.id,
    },
    {
      title: 'Entrega concluída',
      message:
        'Patrícia Lemos confirmou a entrega da mudança corporativa em Porto Alegre.',
      category: NotificationCategory.FREIGHT,
      iconStyle: 'freightDelivery',
      senderId: drivers.get('patricia')!.id,
      senderType: EntityType.USER,
      read: true,
      hoursAgo: 24 * 15,
      relatedType: 'freight',
      relatedId: freights.get('done-moveis')!.id,
    },
    {
      title: 'Nova avaliação recebida',
      message: 'Você recebeu uma avaliação 5 estrelas de Patrícia Lemos.',
      category: NotificationCategory.SYSTEM,
      iconStyle: 'welcome',
      senderId: drivers.get('patricia')!.id,
      senderType: EntityType.USER,
      read: true,
      hoursAgo: 24 * 15,
      relatedType: 'review',
      relatedId: 'demo-review-u6',
    },
    {
      title: 'Assinatura renovada',
      message:
        'Sua assinatura foi renovada com sucesso. Próxima cobrança em 30 dias.',
      category: NotificationCategory.PAYMENT,
      iconStyle: 'upgrade',
      senderId: COMPANY_ID,
      senderType: EntityType.COMPANY,
      read: true,
      hoursAgo: 24 * 30,
    },
    {
      title: 'Bem-vindo à NFretes',
      message:
        'Sua conta de demonstração está pronta. Explore o painel completo!',
      category: NotificationCategory.SYSTEM,
      iconStyle: 'welcome',
      senderId: COMPANY_ID,
      senderType: EntityType.COMPANY,
      read: true,
      hoursAgo: 24 * 30,
    },
  ];

  const notificationRepo = connectionSource.getRepository(Notification);
  for (const [index, seed] of notificationSeeds.entries()) {
    const notification = await notificationRepo.save(
      notificationRepo.create({
        category: seed.category,
        title: seed.title,
        message: seed.message,
        senderType: seed.senderType,
        senderId: seed.senderId,
        recipientType: EntityType.COMPANY,
        recipientId: company.id,
        status: seed.read ? NotificationStatus.READ : NotificationStatus.UNREAD,
        readAt: seed.read ? hoursAgo(seed.hoursAgo - 1) : null,
        relatedEntityType: seed.relatedType,
        relatedEntityId: seed.relatedId,
        iconStyle: seed.iconStyle,
        isBroadcast: false,
        payload: { seededIndex: index },
      }),
    );
    await connectionSource.query(
      `UPDATE notifications SET created_at = $1 WHERE id = $2`,
      [hoursAgo(seed.hoursAgo), notification.id],
    );
  }

  console.log('');
  console.log('Seed concluído com sucesso!');
  console.log('──────────────────────────────────────────');
  console.log('Login da transportadora demo:');
  console.log(`  CNPJ:  ${COMPANY_CNPJ}`);
  console.log('  Senha: definida pela variável DEMO_COMPANY_PASSWORD');
  console.log('──────────────────────────────────────────');
  console.log(
    `Criados: ${driverSeeds.length} motoristas, ${freightSeeds.length} fretes, ${requestSeeds.length} solicitações, ${routeSeeds.length} rotas (3 em andamento com GPS), ${reviewSeeds.length} avaliações, ${notificationSeeds.length} notificações.`,
  );

  await connectionSource.destroy();
}

main().catch(async (error) => {
  console.error('Seed falhou:', error);
  try {
    await connectionSource.destroy();
  } catch {
    // conexão pode não ter sido aberta
  }
  process.exit(1);
});
