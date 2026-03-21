-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT', 'NURSE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'FOLLOW_UP', 'LABORATORY', 'EMERGENCY', 'VACCINATION', 'CHECKUP');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('EMERGENCY', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SMS', 'EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'SKIPPED', 'LEFT');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_code" TEXT,
    "verification_code_expiry" TIMESTAMP(3),
    "reset_password_token" TEXT,
    "reset_password_expiry" TIMESTAMP(3),
    "blood_type" TEXT,
    "allergies" TEXT,
    "medical_history" TEXT,
    "specialization" TEXT,
    "license_number" TEXT,
    "department" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "appointment_date" TIMESTAMP(3) NOT NULL,
    "appointment_type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIUM',
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "estimated_wait_time" INTEGER,
    "actual_start_time" TIMESTAMP(3),
    "actual_end_time" TIMESTAMP(3),
    "no_show_probability" DOUBLE PRECISION,
    "predicted_duration" INTEGER,
    "ai_priority_score" DOUBLE PRECISION,
    "chief_complaint" TEXT,
    "symptoms" TEXT,
    "vital_signs" TEXT,
    "diagnosis" TEXT,
    "prescription" TEXT,
    "notes" TEXT,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_sent_at" TIMESTAMP(3),
    "confirmation_required" BOOLEAN NOT NULL DEFAULT true,
    "confirmed_at" TIMESTAMP(3),
    "queue_position" INTEGER,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,
    "check_in_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,
    "notification_type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "template_name" TEXT,
    "recipient_email" TEXT,
    "recipient_phone" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queues" (
    "id" SERIAL NOT NULL,
    "queue_date" TIMESTAMP(3) NOT NULL,
    "department" TEXT NOT NULL,
    "queue_number" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,
    "patient_name" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "priority_level" TEXT NOT NULL DEFAULT 'medium',
    "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "check_in_time" TIMESTAMP(3) NOT NULL,
    "called_time" TIMESTAMP(3),
    "service_start_time" TIMESTAMP(3),
    "service_end_time" TIMESTAMP(3),
    "estimated_wait_time" INTEGER,
    "actual_wait_time" INTEGER,
    "service_type" TEXT NOT NULL,
    "doctor_name" TEXT,
    "room_number" TEXT,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_idx" ON "appointments"("doctor_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_date_idx" ON "appointments"("appointment_date");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_appointment_id_idx" ON "notifications"("appointment_id");

-- CreateIndex
CREATE INDEX "queues_patient_id_idx" ON "queues"("patient_id");

-- CreateIndex
CREATE INDEX "queues_appointment_id_idx" ON "queues"("appointment_id");

-- CreateIndex
CREATE INDEX "queues_queue_date_idx" ON "queues"("queue_date");

-- CreateIndex
CREATE INDEX "queues_department_idx" ON "queues"("department");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
