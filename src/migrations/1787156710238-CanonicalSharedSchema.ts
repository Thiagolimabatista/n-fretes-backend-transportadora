import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalSharedSchema1787156710238 implements MigrationInterface {
  name = 'CanonicalSharedSchema1787156710238';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existingApplicationTables: Array<{ table_name: string }> =
      await queryRunner.query(`
                SELECT "table_name"
                FROM "information_schema"."tables"
                WHERE "table_schema" = 'public'
                  AND "table_type" = 'BASE TABLE'
                  AND "table_name" NOT IN ('migrations', 'typeorm_metadata')
            `);

    if (existingApplicationTables.length > 0) {
      throw new Error(
        'CanonicalSharedSchema is an empty-database baseline. ' +
          `Existing tables: ${existingApplicationTables
            .map(({ table_name }) => table_name)
            .sort()
            .join(', ')}`,
      );
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent"`);

    await queryRunner.query(`
            CREATE TYPE "public"."freight_requests_status_enum" AS ENUM(
                'PENDING',
                'ACCEPTED',
                'REJECTED',
                'AWAITING_USER_DRIVE_RESPONSE',
                'DRIVER_CONFIRMED_DELIVERY',
                'DELIVERY_COMPLETED',
                'NOT_CONFIRMED_DELIVERY'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "freight_requests" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "freightId" character varying,
                "userDriveId" character varying,
                "companyId" character varying,
                "status" "public"."freight_requests_status_enum" NOT NULL DEFAULT 'PENDING',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "expiresAt" TIMESTAMP,
                "solicitationsOrder" integer DEFAULT '0',
                CONSTRAINT "PK_05c6ea6195623335c81b1cd5d14" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "reviews_user_drive" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "freightId" character varying,
                "userDriveId" character varying,
                "companyId" character varying,
                "routeId" character varying,
                "isUserReviewingCompany" boolean NOT NULL DEFAULT false,
                "isCompanyReviewingUser" boolean NOT NULL DEFAULT false,
                "rating" integer,
                "comment" text,
                "tags" text NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9230b479f4e42edc3728dafb65f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "freight_route_locations" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "latitude" numeric(10, 8) NOT NULL,
                "longitude" numeric(11, 8) NOT NULL,
                "address" character varying,
                "city" character varying,
                "state" character varying,
                "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
                "routeId" character varying NOT NULL,
                CONSTRAINT "PK_1cb62c40ca7585d0306467d9a80" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_routes_status_enum" AS ENUM('PROGUESS', 'COMPLETED', 'CANCEL')
        `);
    await queryRunner.query(`
            CREATE TABLE "freight_routes" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "freightId" character varying,
                "userDriveId" character varying,
                "companyId" character varying,
                "status" "public"."freight_routes_status_enum" NOT NULL DEFAULT 'PROGUESS',
                "isActive" boolean NOT NULL DEFAULT true,
                "avalationCompany" boolean NOT NULL DEFAULT false,
                "avalationUserDrive" boolean NOT NULL DEFAULT false,
                "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6bd5aa61b86cc32558ab095c176" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "route_cache" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "originCity" character varying NOT NULL,
                "destinationCity" character varying NOT NULL,
                "tolls" jsonb NOT NULL,
                "totalToll" numeric(10, 2) NOT NULL,
                "distance" integer NOT NULL,
                "distanceText" character varying NOT NULL,
                "duration" character varying NOT NULL,
                "fuelConsumption" numeric(10, 2) NOT NULL,
                "coordinates" jsonb NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "isValid" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_8ee2e2ae6dbf0800b0385d3b6bb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_cc4c1b97fd5c5e50b427c58c42" ON "route_cache" ("originCity", "destinationCity")
        `);
    await queryRunner.query(`
            CREATE TABLE "freight-documents" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "companyId" character varying NOT NULL,
                "freightId" character varying NOT NULL,
                "fileName" character varying NOT NULL,
                "fileKey" character varying NOT NULL,
                "fileUrl" character varying NOT NULL,
                "mimeType" character varying NOT NULL,
                "fileSizeBytes" integer NOT NULL,
                "description" text,
                "tags" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c7efdd4e60db631f2f73e555183" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_shippinglocation_enum" AS ENUM('Nacional', 'Internacional')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_typeofload_enum" AS ENUM('Completa', 'Complemento')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_specieofload_enum" AS ENUM(
                'Animais',
                'Big Bag',
                'Bobina',
                'Caixas',
                'Container',
                'Diversos',
                'Fardos',
                'Fracionada',
                'Granel',
                'Metro cúbico',
                'Milheiro',
                'Mudanças',
                'Palhetes',
                'Passageiros',
                'Sacos',
                'Tambor',
                'Unidades'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_unitymetric_enum" AS ENUM('Por toneladas', 'Por quilos', 'Por palhetes')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_calvalue_enum" AS ENUM('Já sei o valor', 'A combinar')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."freight_toll_enum" AS ENUM('Incluso no valor', 'Pago a parte')
        `);
    await queryRunner.query(`
            CREATE TABLE "freight" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "shippingLocation" "public"."freight_shippinglocation_enum" NOT NULL DEFAULT 'Nacional',
                "originCity" character varying,
                "originState" character varying,
                "dateOrigin" TIMESTAMP,
                "destinyCity" character varying,
                "destinyState" character varying,
                "dateReceiver" TIMESTAMP,
                "typeOfLoad" "public"."freight_typeofload_enum" NOT NULL DEFAULT 'Completa',
                "lona" boolean NOT NULL DEFAULT false,
                "tracker" boolean NOT NULL DEFAULT false,
                "product" character varying,
                "specieOfLoad" "public"."freight_specieofload_enum" NOT NULL,
                "anttLoadType" character varying,
                "weightOfLoad" character varying,
                "weightOfLoadLenght" character varying,
                "weightOfLoadHeight" character varying,
                "weightOfLoadWidth" character varying,
                "unityMetric" "public"."freight_unitymetric_enum",
                "valueCall" character varying,
                "volume" character varying,
                "security" boolean NOT NULL DEFAULT true,
                "vehicleTypes" text,
                "bodyTypes" text,
                "valueAdvance" double precision DEFAULT '0',
                "Valuefreight" double precision DEFAULT '0',
                "calValue" "public"."freight_calvalue_enum" NOT NULL,
                "Toll" "public"."freight_toll_enum" NOT NULL,
                "methodPayment" character varying,
                "observation" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "openSolicitations" boolean NOT NULL DEFAULT true,
                "companyId" character varying NOT NULL,
                "contactCompanyId" character varying,
                "contactCompanyIds" text,
                "contactGroupIds" text,
                "tags" text,
                "originLongitude" character varying,
                "originLatitude" character varying,
                "destinyLongitude" character varying,
                "destinyLatitude" character varying,
                "distance" character varying,
                "routeCacheId" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "isPublic" boolean NOT NULL DEFAULT true,
                "isFeatured" boolean NOT NULL DEFAULT false,
                "isExclude" boolean NOT NULL DEFAULT false,
                "isExcludeUserId" character varying,
                "isToShare" boolean NOT NULL DEFAULT true,
                "sourceFreightId" character varying,
                "expiresAt" TIMESTAMP,
                CONSTRAINT "PK_f234093c6ea4668afa850736cc7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "contact-company" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying,
                "phoneNumber" character varying,
                "companyId" character varying NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "email" character varying,
                "cpf" character varying,
                "password" character varying,
                CONSTRAINT "PK_64ac04214cc686678c740bcdcbe" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "plan-features" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "description" character varying NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8ff359688a9c1d3f83cd71a06ed" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "plan-feature-limits" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "planId" character varying NOT NULL,
                "featureId" character varying NOT NULL,
                "monthlyLimit" integer,
                "included" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_c03c4cad1cd1226211b0baac9c4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."plans-company_billingcycle_enum" AS ENUM('MONTHLY', 'ANNUALLY', 'WEEKLY')
        `);
    await queryRunner.query(`
            CREATE TABLE "plans-company" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "description" character varying NOT NULL,
                "name" character varying NOT NULL,
                "status" boolean NOT NULL DEFAULT true,
                "value" double precision NOT NULL,
                "trialDays" integer NOT NULL DEFAULT '0',
                "isTrial" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "billingCycle" "public"."plans-company_billingcycle_enum" NOT NULL DEFAULT 'MONTHLY',
                CONSTRAINT "PK_feaa7f3d6070dc3b79d304da11b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "feature-usage" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "subscriptionId" character varying NOT NULL,
                "featureId" character varying NOT NULL,
                "quantityUsed" integer NOT NULL,
                "metadata" jsonb,
                "usedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f2d1a8a1c9c4c3f0dc64dc966a2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "subscription-company" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "status" integer DEFAULT '1',
                "merchantOrderId" character varying,
                "planId" character varying,
                "companyId" character varying,
                "amount" double precision NOT NULL,
                "nextRecurrency" character varying,
                "endDate" character varying,
                "interval" integer,
                "trialStartDate" TIMESTAMP,
                "trialEndDate" TIMESTAMP,
                "isInTrial" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "REL_b5ef6f8e7dec0695fb9c2e3308" UNIQUE ("companyId"),
                CONSTRAINT "PK_6b313b8f36ba28f4b0aabe20078" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users_favorites_company" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "userId" character varying,
                "companyId" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "isActive" boolean NOT NULL DEFAULT true,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_75afbb11adaf1515e2a6f46acde" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."transactions_paymentmethod_enum" AS ENUM('CREDIT_CARD', 'PIX', 'BOLETO')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."transactions_transactiontype_enum" AS ENUM('COMPANY', 'USER')
        `);
    await queryRunner.query(`
            CREATE TABLE "transactions" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "amount" double precision NOT NULL,
                "reason" character varying,
                "companyId" character varying,
                "userId" character varying,
                "paymentMethod" "public"."transactions_paymentmethod_enum",
                "transactionType" "public"."transactions_transactiontype_enum",
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "credit_card" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" character varying,
                "lastFourDigits" character varying,
                "brand" character varying NOT NULL,
                "holderName" character varying NOT NULL,
                "expirationMonth" character varying NOT NULL,
                "expirationYear" character varying NOT NULL,
                "creditCardToken" character varying NOT NULL,
                "isDefault" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_97c08b6c8d5c1df81bf1a96c43e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "company" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying,
                "nameFantasy" character varying,
                "email" character varying,
                "phoneNumber" character varying,
                "phoneNumberJson" json,
                "phoneContact" character varying,
                "cnpj" character varying,
                "cpf" character varying,
                "contractSocial" character varying,
                "socios" json,
                "transportCategory" character varying,
                "password" character varying,
                "isActive" boolean NOT NULL DEFAULT false,
                "isCompleted" boolean NOT NULL DEFAULT false,
                "isSucess" boolean NOT NULL DEFAULT false,
                "isOn" boolean NOT NULL DEFAULT false,
                "antt" character varying,
                "accessIp" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "documentsUrl" character varying,
                "zipcode" character varying,
                "street" character varying,
                "number" character varying,
                "city" character varying,
                "state" character varying,
                "country" character varying,
                "complement" character varying,
                "district" character varying,
                "photoUrl" character varying,
                "assas_id" character varying,
                "siimpUsername" character varying,
                "siimpPassword" character varying,
                "userPhotoURL" character varying,
                "siimpIntegrationActive" boolean NOT NULL DEFAULT false,
                CONSTRAINT "UQ_b0fc567cf51b1cf717a9e8046a1" UNIQUE ("email"),
                CONSTRAINT "PK_056f7854a7afdba7cbd6d45fc20" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_b55d9c6e6adfa3c6de735c5a2e" ON "company" ("cnpj")
        `);
    await queryRunner.query(`
            CREATE TABLE "company-users-contacts" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "userId" character varying,
                "companyId" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "isActive" boolean NOT NULL DEFAULT true,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7577d00a143cad22b47f6c26921" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users_location" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "userId" character varying,
                "latitude" numeric(10, 6) NOT NULL,
                "longitude" numeric(10, 6) NOT NULL,
                "city" character varying(255) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "lastUpdatedAt" TIMESTAMP,
                CONSTRAINT "PK_1523fb2aebce55b9e820122ee0e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "achievements" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "description" text,
                "requiredTags" integer,
                "tagId" integer,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                CONSTRAINT "UQ_b2d2ec6547a003ee5b43a71dbe3" UNIQUE ("name"),
                CONSTRAINT "PK_1bc19c37c6249f70186f318d71d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "user_drive_achievements" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "achievementId" character varying,
                "userDriveId" character varying,
                "achievedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f9e15563c5284e21c5364940a17" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "subscription_users_drive" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "status" integer DEFAULT '1',
                "merchantOrderId" character varying,
                "planId" character varying,
                "userId" character varying,
                "amount" double precision NOT NULL,
                "nextRecurrency" character varying,
                "endDate" character varying,
                "interval" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "REL_8a7af5af91d4cd9a3a1cbae0b0" UNIQUE ("userId"),
                CONSTRAINT "PK_3d80f4a03a11367a398c302c4a8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users_drive" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying,
                "email" character varying,
                "phoneNumber" character varying,
                "password" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "cpf" character varying,
                "photoFaceURL" character varying,
                "documentPhotoURL" character varying,
                "zipcode" character varying,
                "street" character varying,
                "number" character varying,
                "city" character varying,
                "state" character varying,
                "country" character varying,
                "complement" character varying,
                "isSucess" boolean NOT NULL DEFAULT false,
                "district" character varying,
                "device" character varying,
                "lastAccess" TIMESTAMP,
                "accessIp" character varying,
                "antt" character varying,
                "cnh" character varying,
                "pushToken" character varying,
                "similiary" double precision DEFAULT '0',
                "isOnRoute" boolean NOT NULL DEFAULT false,
                CONSTRAINT "UQ_88dbabbf26612cd43070c77cc8e" UNIQUE ("email"),
                CONSTRAINT "PK_1fe3347e9e81854d6a05c590cb3" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_f3b86d78d49a47d7bf04c6395e" ON "users_drive" ("cpf")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."vehicles_vehicletype_enum" AS ENUM(
                'Three Quarter',
                'Fiorino',
                'Stump',
                'VCL',
                'Bit Truck',
                'Truck',
                'Bi Train',
                'Cart',
                'Cart LS',
                'Road Train',
                'Vanderleia',
                'allLight',
                'threeFour',
                'toco',
                'allWeight',
                'train wheel',
                'allAverage'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."vehicles_bodytype_enum" AS ENUM(
                'Chest',
                'Fridge Chest',
                'Refrigerated Chest',
                'Sider',
                'Bucket',
                'Low Grille',
                'Bulk Carrier',
                'Platform',
                'Board',
                'Only Horse',
                'Bug Container Door',
                'Prattle',
                'Blinker',
                'Cavaqueira',
                'Cage',
                'Container',
                'Hopper',
                'Munk',
                'Silo',
                'Tank'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "vehicles" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "vehicleType" "public"."vehicles_vehicletype_enum" NOT NULL,
                "bodyType" "public"."vehicles_bodytype_enum" NOT NULL,
                "plateNumber" character varying,
                "plateState" character varying,
                "renavam" character varying,
                "year" integer,
                "color" character varying,
                "isPlateValid" boolean NOT NULL DEFAULT false,
                "isRenavamValid" boolean NOT NULL DEFAULT false,
                "chassi" character varying,
                "tracker" boolean NOT NULL DEFAULT false,
                "locator" boolean NOT NULL DEFAULT false,
                "userId" character varying NOT NULL,
                "isMainVehicle" boolean NOT NULL DEFAULT false,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "capacity" double precision NOT NULL DEFAULT '0',
                "antt" character varying,
                CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "version_app" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "version" character varying(20) NOT NULL,
                "platform" character varying(50),
                "forceUpdate" boolean NOT NULL DEFAULT false,
                "isActive" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4e17f70b8315eac27d4c52eefba" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."users_count_download_platform_enum" AS ENUM('ios', 'android')
        `);
    await queryRunner.query(`
            CREATE TABLE "users_count_download" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "platform" "public"."users_count_download_platform_enum" NOT NULL,
                "clickedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a735cd322c9070acbe1a377f695" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."users_favorite_destinations_type_enum" AS ENUM('CITY', 'STATE', 'REGION')
        `);
    await queryRunner.query(`
            CREATE TABLE "users_favorite_destinations" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "userId" character varying NOT NULL,
                "type" "public"."users_favorite_destinations_type_enum" NOT NULL,
                "name" character varying NOT NULL,
                "state" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e4c7b7c00f65b23318615b0c74b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."ui-features_type_enum" AS ENUM(
                'SCREEN',
                'BUTTON',
                'COMPONENT',
                'TAB',
                'MENU_ITEM',
                'SECTION'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."ui-features_category_enum" AS ENUM(
                'FREIGHT',
                'DASHBOARD',
                'COMPANY',
                'USERS',
                'REPORTS',
                'SETTINGS',
                'INTEGRATIONS',
                'FINANCIAL',
                'ANALYTICS',
                'NOTIFICATIONS'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "ui-features" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "key" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text,
                "type" "public"."ui-features_type_enum" NOT NULL,
                "category" "public"."ui-features_category_enum" NOT NULL,
                "parentKey" character varying,
                "isVisible" boolean NOT NULL DEFAULT true,
                "isActive" boolean NOT NULL DEFAULT true,
                "displayOrder" integer NOT NULL DEFAULT '0',
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_b633b790c613ab27d2c52e1e03c" UNIQUE ("key"),
                CONSTRAINT "PK_a067911c3d5bd7c2e8402450954" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "recovery_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" integer NOT NULL,
                "phoneNumber" character varying NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "used" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_0723b9e53961e799027d7f7ba32" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."integrations_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')
        `);
    await queryRunner.query(`
            CREATE TABLE "integrations" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "username" character varying NOT NULL,
                "password" character varying NOT NULL,
                "companyName" character varying,
                "contactEmail" character varying,
                "contactPhone" character varying,
                "status" "public"."integrations_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "permissions" jsonb,
                "metadata" jsonb,
                "lastUsedAt" TIMESTAMP,
                "requestCount" integer NOT NULL DEFAULT '0',
                "refreshToken" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_7730aae717c31b61bc9d37139c9" UNIQUE ("username"),
                CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."notifications_category_enum" AS ENUM(
                'freight',
                'payment',
                'system',
                'maintenance',
                'document',
                'chat'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."notifications_sendertype_enum" AS ENUM('user', 'company')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."notifications_recipienttype_enum" AS ENUM('user', 'company')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."notifications_status_enum" AS ENUM('unread', 'read', 'archived', 'deleted')
        `);
    await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "category" "public"."notifications_category_enum" NOT NULL DEFAULT 'system',
                "title" character varying(255) NOT NULL,
                "message" text NOT NULL,
                "senderType" "public"."notifications_sendertype_enum" NOT NULL,
                "senderId" character varying NOT NULL,
                "recipientType" "public"."notifications_recipienttype_enum" NOT NULL,
                "recipientId" character varying NOT NULL,
                "payload" jsonb,
                "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'unread',
                "related_entity_type" character varying,
                "related_entity_id" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP,
                "is_broadcast" boolean NOT NULL DEFAULT false,
                "read_at" TIMESTAMP,
                "iconStyle" character varying,
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ddb7981cf939fe620179bfea33" ON "notifications" ("senderId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_db873ba9a123711a4bff527ccd" ON "notifications" ("recipientId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8c45eb3c00343786657b7edab2" ON "notifications" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "freight_views" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "freightId" character varying NOT NULL,
                "userId" character varying NOT NULL,
                "viewedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "expiresAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_32b4a879b939fc7fe0b6340d6b2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_62cfb675e7e68bff5744bbd3ee" ON "freight_views" ("freightId", "userId")
        `);
    await queryRunner.query(`
            CREATE TABLE "freight_quotes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "date" character varying NOT NULL,
                "commodity" character varying NOT NULL,
                "origin" character varying NOT NULL,
                "destination" character varying NOT NULL,
                "typeFlag" character varying,
                "predictedFreight" numeric(10, 2) NOT NULL,
                "horizonPredictions" json NOT NULL,
                "distance" bigint NOT NULL,
                "duration" integer NOT NULL,
                "monthlyTotal" integer NOT NULL,
                "anttData" json NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_06a77f0310e4f7b391924ce0b14" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_5ff50ff8c542353cad6c0820b9" ON "freight_quotes" ("origin", "destination", "commodity")
        `);
    await queryRunner.query(`
            CREATE TABLE "forms" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "email" character varying,
                "nome" character varying NOT NULL,
                "whatsapp" character varying NOT NULL,
                "cnpj" character varying NOT NULL,
                "served" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ba062fd30b06814a60756f233da" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "feedbacks" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "imageUrl" character varying,
                "description" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                "resolved" boolean NOT NULL DEFAULT false,
                "userId" character varying,
                CONSTRAINT "PK_79affc530fdd838a9f1e0cc30be" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "feature-logs" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "subscriptionId" character varying NOT NULL,
                "featureId" character varying NOT NULL,
                "quantityChange" integer NOT NULL,
                "metadata" jsonb,
                "relatedEntityId" character varying,
                "description" character varying,
                "loggedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "performedById" character varying,
                "performedByType" character varying,
                CONSTRAINT "PK_4065516e699dc5640abb68ca702" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "exclude" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "cpf" character varying,
                "cnpj" character varying,
                "reason" text NOT NULL,
                "dataSolicitacao" TIMESTAMP NOT NULL DEFAULT now(),
                "jaExcluido" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_b9136b5b3a9fc93c2294b57fc88" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "contact-group" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "companyId" character varying NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7bd2ecf4a5d02008455b2966ea2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "driver-documents" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "companyId" character varying NOT NULL,
                "userId" character varying NOT NULL,
                "fileName" character varying NOT NULL,
                "fileKey" character varying NOT NULL,
                "fileUrl" character varying NOT NULL,
                "mimeType" character varying NOT NULL,
                "fileSizeBytes" integer NOT NULL,
                "description" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cc060e11bc084eb5565c7c0f999" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."admin_role_enum" AS ENUM('admin', 'super_admin')
        `);
    await queryRunner.query(`
            CREATE TABLE "admin" (
                "id" character varying NOT NULL DEFAULT gen_random_uuid(),
                "email" character varying NOT NULL,
                "role" "public"."admin_role_enum" NOT NULL,
                "name" character varying NOT NULL,
                "cpf" character varying NOT NULL,
                "birthDate" date NOT NULL,
                "phoneNumber" character varying NOT NULL,
                "photoUrl" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "lastAccess" TIMESTAMP,
                "password" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                CONSTRAINT "UQ_de87485f6489f5d0995f5841952" UNIQUE ("email"),
                CONSTRAINT "UQ_15329fb789ccfd5b452bd700a3c" UNIQUE ("cpf"),
                CONSTRAINT "PK_e032310bcef831fb83101899b10" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "contact-group-members" (
                "groupId" character varying NOT NULL,
                "contactId" character varying NOT NULL,
                CONSTRAINT "PK_3266f89c232753fe90255ef5b5c" PRIMARY KEY ("groupId", "contactId")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_296fb60b8e44aad59279f30621" ON "contact-group-members" ("groupId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9f0f5f0250b53008b3847c3541" ON "contact-group-members" ("contactId")
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests"
            ADD CONSTRAINT "FK_d699d3fcc566168759d067ed4fc" FOREIGN KEY ("freightId") REFERENCES "freight"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests"
            ADD CONSTRAINT "FK_e5ba7ac7aef79a1c8e8ae1fb304" FOREIGN KEY ("userDriveId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests"
            ADD CONSTRAINT "FK_b12ae6541983935070f6abee0fe" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive"
            ADD CONSTRAINT "FK_14733674291e09631003fca8233" FOREIGN KEY ("userDriveId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive"
            ADD CONSTRAINT "FK_9992a76a2fc5c025626975792fd" FOREIGN KEY ("freightId") REFERENCES "freight"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive"
            ADD CONSTRAINT "FK_9a369ea54a3c7bd3eb76a48fe76" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive"
            ADD CONSTRAINT "FK_1f24e697a830cb8552e0ba030a4" FOREIGN KEY ("routeId") REFERENCES "freight_routes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_route_locations"
            ADD CONSTRAINT "FK_a3b7e64dc28c9770fefcd42cd70" FOREIGN KEY ("routeId") REFERENCES "freight_routes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes"
            ADD CONSTRAINT "FK_d3baa9b289dd08e4f8cbf5ab1de" FOREIGN KEY ("freightId") REFERENCES "freight"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes"
            ADD CONSTRAINT "FK_8d22c53c59228db67720c5cc329" FOREIGN KEY ("userDriveId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes"
            ADD CONSTRAINT "FK_1c00aeb4be6577dede47e951726" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight-documents"
            ADD CONSTRAINT "FK_391acb2e7792fe94e4e85e0c372" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight-documents"
            ADD CONSTRAINT "FK_7fa6c6bb461e5756915eea950ab" FOREIGN KEY ("freightId") REFERENCES "freight"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight"
            ADD CONSTRAINT "FK_d0d878470bb7c6f4a91d3b031bb" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight"
            ADD CONSTRAINT "FK_2fe2b618d0bc77f0beff4d67678" FOREIGN KEY ("contactCompanyId") REFERENCES "contact-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight"
            ADD CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa" FOREIGN KEY ("routeCacheId") REFERENCES "route_cache"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-company"
            ADD CONSTRAINT "FK_17c1b13fe108c54e64ce87e08b7" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan-feature-limits"
            ADD CONSTRAINT "FK_fd1cb56d90034ea4485d47b6550" FOREIGN KEY ("planId") REFERENCES "plans-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan-feature-limits"
            ADD CONSTRAINT "FK_216c8975930ebbb5cde8d470860" FOREIGN KEY ("featureId") REFERENCES "plan-features"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-usage"
            ADD CONSTRAINT "FK_37be4c6552714c1e563e0304567" FOREIGN KEY ("subscriptionId") REFERENCES "subscription-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-usage"
            ADD CONSTRAINT "FK_378a033c8cfa7a8e447fcfa0e80" FOREIGN KEY ("featureId") REFERENCES "plan-features"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription-company"
            ADD CONSTRAINT "FK_284daf34518402bc0145419f94e" FOREIGN KEY ("planId") REFERENCES "plans-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription-company"
            ADD CONSTRAINT "FK_b5ef6f8e7dec0695fb9c2e3308c" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users_favorites_company"
            ADD CONSTRAINT "FK_37b349be5c020917e75d46e95cb" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users_favorites_company"
            ADD CONSTRAINT "FK_9356c719ba9523daf11fb435647" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_c5c4bc0ef04ce5729481c60b559" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_6bb58f2b6e30cb51a6504599f41" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "credit_card"
            ADD CONSTRAINT "FK_6560c287f8fc3e57c006d2d93fd" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "company-users-contacts"
            ADD CONSTRAINT "FK_09d340e4b558171497e80af5f21" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "company-users-contacts"
            ADD CONSTRAINT "FK_7d6efebaea14d203e5ce78ffb2b" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users_location"
            ADD CONSTRAINT "FK_a7f8313e66eb546279fd366882b" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_drive_achievements"
            ADD CONSTRAINT "FK_fa9d15c65d35e548231d36b1250" FOREIGN KEY ("userDriveId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_drive_achievements"
            ADD CONSTRAINT "FK_df84f07597da3359a3b5dbbea0d" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription_users_drive"
            ADD CONSTRAINT "FK_a688d1deb4c2de4e0f904858eab" FOREIGN KEY ("planId") REFERENCES "plans-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription_users_drive"
            ADD CONSTRAINT "FK_8a7af5af91d4cd9a3a1cbae0b0d" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "vehicles"
            ADD CONSTRAINT "FK_20f139b9d79f917ef735efacb00" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_views"
            ADD CONSTRAINT "FK_814cdebcaec1d4eb58ed59f661e" FOREIGN KEY ("freightId") REFERENCES "freight"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_views"
            ADD CONSTRAINT "FK_ad4ef0880edd2bf955e32f8aafb" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-logs"
            ADD CONSTRAINT "FK_ebe20fa1fef85c2598369cd202f" FOREIGN KEY ("subscriptionId") REFERENCES "subscription-company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-logs"
            ADD CONSTRAINT "FK_037ae420a48288b73717c20cbd4" FOREIGN KEY ("featureId") REFERENCES "plan-features"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-group"
            ADD CONSTRAINT "FK_3bea244cb33d29dd8a8a681ac84" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "driver-documents"
            ADD CONSTRAINT "FK_aae626cb81d3d9dacb9dd8e1ca0" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "driver-documents"
            ADD CONSTRAINT "FK_7f2c32301f4562627ffae70d461" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-group-members"
            ADD CONSTRAINT "FK_296fb60b8e44aad59279f30621b" FOREIGN KEY ("groupId") REFERENCES "contact-group"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-group-members"
            ADD CONSTRAINT "FK_9f0f5f0250b53008b3847c35417" FOREIGN KEY ("contactId") REFERENCES "company-users-contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "contact-group-members" DROP CONSTRAINT "FK_9f0f5f0250b53008b3847c35417"
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-group-members" DROP CONSTRAINT "FK_296fb60b8e44aad59279f30621b"
        `);
    await queryRunner.query(`
            ALTER TABLE "driver-documents" DROP CONSTRAINT "FK_7f2c32301f4562627ffae70d461"
        `);
    await queryRunner.query(`
            ALTER TABLE "driver-documents" DROP CONSTRAINT "FK_aae626cb81d3d9dacb9dd8e1ca0"
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-group" DROP CONSTRAINT "FK_3bea244cb33d29dd8a8a681ac84"
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-logs" DROP CONSTRAINT "FK_037ae420a48288b73717c20cbd4"
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-logs" DROP CONSTRAINT "FK_ebe20fa1fef85c2598369cd202f"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_views" DROP CONSTRAINT "FK_ad4ef0880edd2bf955e32f8aafb"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_views" DROP CONSTRAINT "FK_814cdebcaec1d4eb58ed59f661e"
        `);
    await queryRunner.query(`
            ALTER TABLE "vehicles" DROP CONSTRAINT "FK_20f139b9d79f917ef735efacb00"
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription_users_drive" DROP CONSTRAINT "FK_8a7af5af91d4cd9a3a1cbae0b0d"
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription_users_drive" DROP CONSTRAINT "FK_a688d1deb4c2de4e0f904858eab"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_drive_achievements" DROP CONSTRAINT "FK_df84f07597da3359a3b5dbbea0d"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_drive_achievements" DROP CONSTRAINT "FK_fa9d15c65d35e548231d36b1250"
        `);
    await queryRunner.query(`
            ALTER TABLE "users_location" DROP CONSTRAINT "FK_a7f8313e66eb546279fd366882b"
        `);
    await queryRunner.query(`
            ALTER TABLE "company-users-contacts" DROP CONSTRAINT "FK_7d6efebaea14d203e5ce78ffb2b"
        `);
    await queryRunner.query(`
            ALTER TABLE "company-users-contacts" DROP CONSTRAINT "FK_09d340e4b558171497e80af5f21"
        `);
    await queryRunner.query(`
            ALTER TABLE "credit_card" DROP CONSTRAINT "FK_6560c287f8fc3e57c006d2d93fd"
        `);
    await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_6bb58f2b6e30cb51a6504599f41"
        `);
    await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_c5c4bc0ef04ce5729481c60b559"
        `);
    await queryRunner.query(`
            ALTER TABLE "users_favorites_company" DROP CONSTRAINT "FK_9356c719ba9523daf11fb435647"
        `);
    await queryRunner.query(`
            ALTER TABLE "users_favorites_company" DROP CONSTRAINT "FK_37b349be5c020917e75d46e95cb"
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription-company" DROP CONSTRAINT "FK_b5ef6f8e7dec0695fb9c2e3308c"
        `);
    await queryRunner.query(`
            ALTER TABLE "subscription-company" DROP CONSTRAINT "FK_284daf34518402bc0145419f94e"
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-usage" DROP CONSTRAINT "FK_378a033c8cfa7a8e447fcfa0e80"
        `);
    await queryRunner.query(`
            ALTER TABLE "feature-usage" DROP CONSTRAINT "FK_37be4c6552714c1e563e0304567"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan-feature-limits" DROP CONSTRAINT "FK_216c8975930ebbb5cde8d470860"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan-feature-limits" DROP CONSTRAINT "FK_fd1cb56d90034ea4485d47b6550"
        `);
    await queryRunner.query(`
            ALTER TABLE "contact-company" DROP CONSTRAINT "FK_17c1b13fe108c54e64ce87e08b7"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight" DROP CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight" DROP CONSTRAINT "FK_2fe2b618d0bc77f0beff4d67678"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight" DROP CONSTRAINT "FK_d0d878470bb7c6f4a91d3b031bb"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight-documents" DROP CONSTRAINT "FK_7fa6c6bb461e5756915eea950ab"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight-documents" DROP CONSTRAINT "FK_391acb2e7792fe94e4e85e0c372"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes" DROP CONSTRAINT "FK_1c00aeb4be6577dede47e951726"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes" DROP CONSTRAINT "FK_8d22c53c59228db67720c5cc329"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_routes" DROP CONSTRAINT "FK_d3baa9b289dd08e4f8cbf5ab1de"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_route_locations" DROP CONSTRAINT "FK_a3b7e64dc28c9770fefcd42cd70"
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive" DROP CONSTRAINT "FK_1f24e697a830cb8552e0ba030a4"
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive" DROP CONSTRAINT "FK_9a369ea54a3c7bd3eb76a48fe76"
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive" DROP CONSTRAINT "FK_9992a76a2fc5c025626975792fd"
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews_user_drive" DROP CONSTRAINT "FK_14733674291e09631003fca8233"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests" DROP CONSTRAINT "FK_b12ae6541983935070f6abee0fe"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests" DROP CONSTRAINT "FK_e5ba7ac7aef79a1c8e8ae1fb304"
        `);
    await queryRunner.query(`
            ALTER TABLE "freight_requests" DROP CONSTRAINT "FK_d699d3fcc566168759d067ed4fc"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9f0f5f0250b53008b3847c3541"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_296fb60b8e44aad59279f30621"
        `);
    await queryRunner.query(`
            DROP TABLE "contact-group-members"
        `);
    await queryRunner.query(`
            DROP TABLE "admin"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."admin_role_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "driver-documents"
        `);
    await queryRunner.query(`
            DROP TABLE "contact-group"
        `);
    await queryRunner.query(`
            DROP TABLE "exclude"
        `);
    await queryRunner.query(`
            DROP TABLE "feature-logs"
        `);
    await queryRunner.query(`
            DROP TABLE "feedbacks"
        `);
    await queryRunner.query(`
            DROP TABLE "forms"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5ff50ff8c542353cad6c0820b9"
        `);
    await queryRunner.query(`
            DROP TABLE "freight_quotes"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_62cfb675e7e68bff5744bbd3ee"
        `);
    await queryRunner.query(`
            DROP TABLE "freight_views"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8c45eb3c00343786657b7edab2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_db873ba9a123711a4bff527ccd"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ddb7981cf939fe620179bfea33"
        `);
    await queryRunner.query(`
            DROP TABLE "notifications"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notifications_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notifications_recipienttype_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notifications_sendertype_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notifications_category_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "integrations"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."integrations_status_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "recovery_codes"
        `);
    await queryRunner.query(`
            DROP TABLE "ui-features"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."ui-features_category_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."ui-features_type_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "users_favorite_destinations"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."users_favorite_destinations_type_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "users_count_download"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."users_count_download_platform_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "version_app"
        `);
    await queryRunner.query(`
            DROP TABLE "vehicles"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."vehicles_bodytype_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."vehicles_vehicletype_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f3b86d78d49a47d7bf04c6395e"
        `);
    await queryRunner.query(`
            DROP TABLE "users_drive"
        `);
    await queryRunner.query(`
            DROP TABLE "subscription_users_drive"
        `);
    await queryRunner.query(`
            DROP TABLE "user_drive_achievements"
        `);
    await queryRunner.query(`
            DROP TABLE "achievements"
        `);
    await queryRunner.query(`
            DROP TABLE "users_location"
        `);
    await queryRunner.query(`
            DROP TABLE "company-users-contacts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b55d9c6e6adfa3c6de735c5a2e"
        `);
    await queryRunner.query(`
            DROP TABLE "company"
        `);
    await queryRunner.query(`
            DROP TABLE "credit_card"
        `);
    await queryRunner.query(`
            DROP TABLE "transactions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."transactions_transactiontype_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."transactions_paymentmethod_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "users_favorites_company"
        `);
    await queryRunner.query(`
            DROP TABLE "subscription-company"
        `);
    await queryRunner.query(`
            DROP TABLE "feature-usage"
        `);
    await queryRunner.query(`
            DROP TABLE "plans-company"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."plans-company_billingcycle_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "plan-feature-limits"
        `);
    await queryRunner.query(`
            DROP TABLE "plan-features"
        `);
    await queryRunner.query(`
            DROP TABLE "contact-company"
        `);
    await queryRunner.query(`
            DROP TABLE "freight"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_toll_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_calvalue_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_unitymetric_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_specieofload_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_typeofload_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_shippinglocation_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "freight-documents"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_cc4c1b97fd5c5e50b427c58c42"
        `);
    await queryRunner.query(`
            DROP TABLE "route_cache"
        `);
    await queryRunner.query(`
            DROP TABLE "freight_routes"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_routes_status_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "freight_route_locations"
        `);
    await queryRunner.query(`
            DROP TABLE "reviews_user_drive"
        `);
    await queryRunner.query(`
            DROP TABLE "freight_requests"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."freight_requests_status_enum"
        `);
  }
}
