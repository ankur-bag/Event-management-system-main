import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import { uploadOnCloudinary, deleteFromCloudinary, cloudinary } from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';

const uploadStreamToCloudinary = (fileBuffer, folderName = 'eventone/posters') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folderName,
        resource_type: 'auto',
        format: 'webp',
        quality: 80,
        width: 1200,
        crop: 'limit',
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    stream.end(fileBuffer);
  });
};

export const createEvent = async (req, res) => {
  try {
    let posterUrl = '';
    if (req.file) {
      const result = await uploadStreamToCloudinary(req.file.buffer, 'eventone/posters');
      posterUrl = result?.secure_url || '';
    }
    const event = await Event.create({ ...req.body, organizer: req.user.id, posterUrl });
    res.status(201).json({ event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const update = { ...req.body };

    if (req.file) {
      const result = await uploadStreamToCloudinary(req.file.buffer, 'eventone/posters');
      if (result?.secure_url) {
        update.posterUrl = result.secure_url;
      }
    }

    // Fetch the old event with the organizer constraint to capture the previous poster URL
    const oldEvent = await Event.findOne(
      { _id: req.params.id, organizer: req.user.id }
    ).lean();
    if (!oldEvent) return res.status(404).json({ message: 'Event not found' });

    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, organizer: req.user.id },
      update,
      { new: true }
    );

    // Delete the old poster from Cloudinary only after a successful authorized update
    if (update.posterUrl && oldEvent.posterUrl) {
      await deleteFromCloudinary(oldEvent.posterUrl);
    }

    res.json({ event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({ _id: req.params.id, organizer: req.user.id });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Clean up the poster from Cloudinary
    if (event.posterUrl) {
      await deleteFromCloudinary(event.posterUrl);
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const listEvents = async (req, res) => {
  try {
    const { q, category, status, organizer } = req.query;
    const filter = {};
    if (q) filter.title = { $regex: q, $options: 'i' };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (organizer) filter.organizer = organizer;
    const events = await Event.find(filter).populate('organizer', 'name').sort({ date: 1 });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

import { sendTicketEmail } from '../utils/email.js';
import { generateQRCodeDataUrl } from '../utils/qrcode.js';

export const getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizer', 'name');
    if (!event) return res.status(404).json({ message: 'Not found' });
    const count = await Registration.countDocuments({ event: event._id, status: { $ne: 'cancelled' } });
    res.json({ event, registrations: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const sendEventReminders = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Only allow the event organizer
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized: Only the event organizer can send reminders' });
    }

    const registrations = await Registration.find({ event: event._id, status: 'registered' }).populate('user');

    let sentCount = 0;
    for (const reg of registrations) {
      if (reg.user && reg.user.email) {
        let qrCode = reg.qrCodeDataUrl;
        if (!qrCode) {
          qrCode = await generateQRCodeDataUrl(JSON.stringify({
            registrationId: reg._id,
            eventId: event._id,
            userId: reg.user._id
          }));
          // Save it back if it helps, or just use it
          reg.qrCodeDataUrl = qrCode;
          await reg.save();
        }
        await sendTicketEmail(reg.user.email, event, reg._id, qrCode);
        sentCount++;
      }
    }

    res.json({ message: `Sent reminders to ${sentCount} participants` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const uploadGalleryImages = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Auth check: organizer must own the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized: Only the event organizer can perform this action' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    const currentGalleryCount = event.gallery.length;
    const newFilesCount = req.files.length;

    if (currentGalleryCount + newFilesCount > 6) {
      return res.status(400).json({ message: `Exceeds maximum limit of 6 gallery images. Currently has ${currentGalleryCount}, trying to add ${newFilesCount}` });
    }

    // Validate size and mimetype
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxFileSize = 5 * 1024 * 1024; // 5MB

    for (const file of req.files) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ message: `Invalid file type: ${file.originalname}. Only JPEG, PNG, and WebP are allowed.` });
      }
      if (file.size > maxFileSize) {
        return res.status(400).json({ message: `File size too large: ${file.originalname}. Maximum file size is 5MB.` });
      }
    }

    // Process uploads
    const newUrls = [];
    for (const file of req.files) {
      const result = await uploadStreamToCloudinary(file.buffer, 'eventone/gallery');
      if (result && result.secure_url) {
        newUrls.push(result.secure_url);
      }
    }

    // Append to gallery and save
    event.gallery.push(...newUrls);
    await event.save();

    res.json({ event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteGalleryImage = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Auth check: organizer must own the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized: Only the event organizer can perform this action' });
    }

    const index = parseInt(req.params.imageIndex, 10);
    if (isNaN(index) || index < 0 || index >= event.gallery.length) {
      return res.status(400).json({ message: 'Invalid image index' });
    }

    const imageUrl = event.gallery[index];

    // If Cloudinary URL, delete from Cloudinary
    if (imageUrl.includes('cloudinary.com')) {
      await deleteFromCloudinary(imageUrl);
    } else if (imageUrl.includes('/uploads/')) {
      // Local file, try deleting it from local storage
      const filename = imageUrl.split('/uploads/')[1];
      if (filename) {
        const filepath = path.join(process.cwd(), 'uploads', filename);
        fs.unlink(filepath, (err) => {
          if (err) console.error('Failed to delete local gallery image:', err);
        });
      }
    }

    // Splice out of array and save
    event.gallery.splice(index, 1);
    await event.save();

    res.json({ event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
