import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const profileRouter = Router();

profileRouter.use(requireAuth);

const teacherProfileSchema = z
  .object({
    fullName: z.string().trim().min(1),
    email: z.string().trim().email(),
    contact: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    location: z.string().trim().min(1),
    linkedin: z.string().trim().optional().or(z.literal("")),
    experience: z.string().trim().min(1),
    education: z.string().trim().min(1)
  })
  .strict();

const studentProfileSchema = z
  .object({
    fullName: z.string().trim().min(1),
    className: z.string().trim().min(1),
    section: z.string().trim().min(1),
    rollNumber: z.string().trim().min(1),
    phoneNumber: z.string().trim().min(1),
    email: z.string().trim().email(),
    location: z.string().trim().min(1),
    dob: z.string().trim().min(1)
  })
  .strict();

const basicProfileSchema = z
  .object({
    fullName: z.string().trim().min(1),
    email: z.string().trim().email(),
    contact: z.string().trim().min(1),
    location: z.string().trim().min(1)
  })
  .strict();

profileRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true }
    });

    if (user.role === "TEACHER") {
      const profile = await prisma.teacherProfile.findUnique({
        where: { userId: user.id }
      });

      return res.json({
        role: "TEACHER",
        fullName: profile?.fullName || user.name || "",
        email: profile?.email || user.email || "",
        contact: profile?.contact || "",
        subject: profile?.subject || "",
        location: profile?.location || "",
        linkedin: profile?.linkedin || "",
        experience: profile?.experience || "",
        education: profile?.education || "",
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "STUDENT") {
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: user.id }
      });

      return res.json({
        role: "STUDENT",
        fullName: profile?.fullName || user.name || "",
        className: profile?.className || (typeof user.classLevel === "number" ? `Class ${user.classLevel}` : ""),
        section: profile?.sectionName || "",
        rollNumber: profile?.rollNumber || "",
        phoneNumber: profile?.phoneNumber || "",
        email: profile?.email || user.email || "",
        location: profile?.location || "",
        dob: profile?.dob ? profile.dob.toISOString() : "",
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      const profile = user.role === "ADMIN"
        ? await prisma.adminProfile.findUnique({
            where: { userId: user.id }
          })
        : null;

      return res.json({
        role: user.role,
        fullName: profile?.fullName || user.name || "",
        email: profile?.email || user.email || "",
        contact: profile?.contact || profile?.contactNumber || "",
        location: profile?.location || "",
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "PARENT") {
      const profile = await prisma.parentProfile.findUnique({
        where: { userId: user.id }
      });

      return res.json({
        role: "PARENT",
        fullName: profile?.fullName || user.name || "",
        email: profile?.email || user.email || "",
        contact: profile?.contact || "",
        location: profile?.location || "",
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    return next(new HttpError(400, "Unsupported role"));
  } catch (error) {
    next(error);
  }
});

profileRouter.put("/", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true }
    });

    if (user.role === "TEACHER") {
      const parsed = teacherProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new HttpError(400, "Invalid teacher profile payload"));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.fullName,
          email: parsed.data.email
        }
      });

      const profile = await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        update: {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          subject: parsed.data.subject,
          location: parsed.data.location,
          linkedin: parsed.data.linkedin?.trim() || null,
          experience: parsed.data.experience,
          education: parsed.data.education
        },
        create: {
          schoolId: user.schoolId,
          userId: user.id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          subject: parsed.data.subject,
          location: parsed.data.location,
          linkedin: parsed.data.linkedin?.trim() || null,
          experience: parsed.data.experience,
          education: parsed.data.education
        }
      });

      return res.json({
        role: "TEACHER",
        fullName: profile.fullName,
        email: profile.email,
        contact: profile.contact,
        subject: profile.subject,
        location: profile.location,
        linkedin: profile.linkedin || "",
        experience: profile.experience,
        education: profile.education,
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "STUDENT") {
      const parsed = studentProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new HttpError(400, "Invalid student profile payload"));
      }

      const dob = new Date(parsed.data.dob);
      if (Number.isNaN(dob.getTime())) {
        return next(new HttpError(400, "Invalid date of birth"));
      }

      const existingProfile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { id: true }
      });

      if (!existingProfile) {
        return next(new HttpError(404, "Student profile not found"));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.fullName,
          email: parsed.data.email
        }
      });

      const profile = await prisma.studentProfile.update({
        where: { userId: user.id },
        data: {
          fullName: parsed.data.fullName,
          className: parsed.data.className,
          sectionName: parsed.data.section,
          rollNumber: parsed.data.rollNumber,
          phoneNumber: parsed.data.phoneNumber,
          email: parsed.data.email,
          location: parsed.data.location,
          dob
        }
      });

      return res.json({
        role: "STUDENT",
        fullName: profile.fullName,
        className: profile.className,
        section: profile.sectionName,
        rollNumber: profile.rollNumber || "",
        phoneNumber: profile.phoneNumber,
        email: profile.email,
        location: profile.location,
        dob: profile.dob?.toISOString() || "",
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "SUPER_ADMIN") {
      const parsed = basicProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new HttpError(400, "Invalid admin profile payload"));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.fullName,
          email: parsed.data.email
        }
      });

      return res.json({
        role: "SUPER_ADMIN",
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        contact: parsed.data.contact,
        location: parsed.data.location,
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "ADMIN") {
      const parsed = basicProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new HttpError(400, "Invalid admin profile payload"));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.fullName,
          email: parsed.data.email
        }
      });

      const profile = await prisma.adminProfile.upsert({
        where: { userId: user.id },
        update: {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          location: parsed.data.location,
          contactNumber: parsed.data.contact
        },
        create: {
          schoolId: user.schoolId,
          userId: user.id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          location: parsed.data.location,
          contactNumber: parsed.data.contact
        }
      });

      return res.json({
        role: "ADMIN",
        fullName: profile.fullName,
        email: profile.email,
        contact: profile.contact,
        location: profile.location,
        emailVerified: Boolean(currentUser?.emailVerified)
      });
    }

    if (user.role === "PARENT") {
      const parsed = basicProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new HttpError(400, "Invalid parent profile payload"));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.fullName,
          email: parsed.data.email
        }
      });

      const profile = await prisma.parentProfile.upsert({
        where: { userId: user.id },
        update: {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          location: parsed.data.location
        },
        create: {
          schoolId: user.schoolId,
          userId: user.id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          contact: parsed.data.contact,
          location: parsed.data.location
        }
      });

      return res.json({
        role: "PARENT",
        fullName: profile.fullName,
        email: profile.email,
        contact: profile.contact,
        location: profile.location,
        emailVerified: Boolean(user.emailVerified)
      });
    }

    return next(new HttpError(400, "Unsupported role"));
  } catch (error) {
    next(error);
  }
});
