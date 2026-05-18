import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Calendar, MapPin, Type, IndianRupee, Users, Tag, X, Plus, Move } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { API_BASE_URL } from '../../config';

export default function CreateEvent() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = !!id;

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        date: '',
        time: '',
        location: '',
        category: 'General',
        price: '',
        capacity: '',
        poster: null
    });

    const [existingPoster, setExistingPoster] = useState(null);
    const [existingGallery, setExistingGallery] = useState([]);
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [galleryPreviews, setGalleryPreviews] = useState([]);
    const [draggedIndex, setDraggedIndex] = useState(null);

    useEffect(() => {
        if (isEditMode) {
            fetchEventDetails();
        }
    }, [id]);

    const fetchEventDetails = async () => {
        try {
            setFetching(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/events/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                const event = data.event;

                // Parse date and time
                let formattedDate = '';
                let formattedTime = '';
                if (event.date) {
                    const eventDateObj = new Date(event.date);
                    formattedDate = eventDateObj.toISOString().split('T')[0];
                    formattedTime = eventDateObj.toTimeString().split(' ')[0].substring(0, 5);
                }

                setFormData({
                    title: event.title || '',
                    description: event.description || '',
                    date: formattedDate,
                    time: formattedTime,
                    location: event.location || '',
                    category: event.category || 'General',
                    price: event.price || 0,
                    capacity: event.capacity || 0,
                    poster: null
                });
                setExistingPoster(event.posterUrl || null);
                setExistingGallery(event.gallery || []);
            } else {
                alert("Failed to load event details.");
            }
        } catch (error) {
            console.error("Error fetching event details", error);
            alert("Something went wrong while fetching event details.");
        } finally {
            setFetching(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (name === 'poster') {
            setFormData({ ...formData, poster: files[0] });
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleGalleryChange = (e) => {
        const files = Array.from(e.target.files || []);
        const totalCount = existingGallery.length + galleryFiles.length + files.length;
        if (totalCount > 6) {
            alert("You can upload a maximum of 6 gallery images in total.");
            return;
        }

        const validFiles = [];
        const newPreviews = [];

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                alert(`File "${file.name}" is not an image.`);
                continue;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert(`File "${file.name}" exceeds the 5MB size limit.`);
                continue;
            }
            validFiles.push(file);
            newPreviews.push(URL.createObjectURL(file));
        }

        setGalleryFiles([...galleryFiles, ...validFiles]);
        setGalleryPreviews([...galleryPreviews, ...newPreviews]);
    };

    const removeGalleryFile = (index) => {
        const updatedFiles = [...galleryFiles];
        const updatedPreviews = [...galleryPreviews];

        URL.revokeObjectURL(updatedPreviews[index]);

        updatedFiles.splice(index, 1);
        updatedPreviews.splice(index, 1);

        setGalleryFiles(updatedFiles);
        setGalleryPreviews(updatedPreviews);
    };

    const deleteExistingGalleryImage = async (index) => {
        if (!confirm('Are you sure you want to delete this gallery image from the database?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/events/${id}/gallery/${index}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setExistingGallery(data.event.gallery || []);
            } else {
                const err = await res.json();
                alert(`Error: ${err.message}`);
            }
        } catch (error) {
            console.error("Failed to delete gallery image", error);
            alert("Something went wrong while deleting image.");
        }
    };

    // Drag-to-Reorder Native HTML5 APIs
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
    };

    const handleDrop = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const files = [...galleryFiles];
        const previews = [...galleryPreviews];

        // Swap files
        const [draggedFile] = files.splice(draggedIndex, 1);
        files.splice(index, 0, draggedFile);

        // Swap previews
        const [draggedPreview] = previews.splice(draggedIndex, 1);
        previews.splice(index, 0, draggedPreview);

        setGalleryFiles(files);
        setGalleryPreviews(previews);
        setDraggedIndex(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const data = new FormData();
            const fullDate = new Date(`${formData.date}T${formData.time}`);

            data.append('title', formData.title);
            data.append('description', formData.description);
            data.append('date', fullDate.toISOString());
            data.append('location', formData.location);
            data.append('category', formData.category);
            data.append('price', formData.price);
            data.append('capacity', formData.capacity);
            if (formData.poster) {
                data.append('poster', formData.poster);
            }

            const token = localStorage.getItem('token');
            const url = isEditMode ? `${API_BASE_URL}/api/events/${id}` : `${API_BASE_URL}/api/events`;
            const method = isEditMode ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: data
            });

            if (res.ok) {
                const result = await res.json();
                const eventId = isEditMode ? id : result.event._id;

                // Now upload new gallery images if any were selected
                if (galleryFiles.length > 0) {
                    const galleryData = new FormData();
                    galleryFiles.forEach(file => {
                        galleryData.append('gallery', file);
                    });

                    const galleryRes = await fetch(`${API_BASE_URL}/api/events/${eventId}/gallery`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: galleryData
                    });

                    if (!galleryRes.ok) {
                        const gallErr = await galleryRes.json();
                        alert(`Event saved, but gallery upload failed: ${gallErr.message}`);
                    }
                }

                // Cleanup memory URLs
                galleryPreviews.forEach(url => URL.revokeObjectURL(url));

                navigate('/organizer/dashboard');
            } else {
                const err = await res.json();
                alert(`Error: ${err.message}`);
            }
        } catch (error) {
            console.error("Failed to save event", error);
            alert("Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="relative min-h-screen pt-24 px-4 pb-12">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Event' : 'Create New Event'}</h1>
                    <p className="text-muted-foreground mt-2">
                        {isEditMode ? 'Modify details for your existing event' : 'Fill in the details to publish your event'}
                    </p>
                </div>

                <motion.form
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8 bg-card border border-border p-8 rounded-2xl shadow-xl"
                    onSubmit={handleSubmit}
                >
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="title">Event Title</Label>
                            <div className="relative mt-2">
                                <Type className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="title"
                                    name="title"
                                    className="pl-9"
                                    placeholder="e.g. Annual Tech Conference"
                                    required
                                    value={formData.title}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                className="mt-2"
                                placeholder="Tell people what your event is about..."
                                rows={5}
                                required
                                maxLength={500}
                                value={formData.description}
                                onChange={handleChange}
                            />
                            <div className="flex justify-end mt-1">
                                <span className={`text-xs font-medium ${
                                    formData.description.length > 450
                                        ? 'text-red-500'
                                        : 'text-muted-foreground'
                                }`}>
                                    {formData.description.length} / 500
                                    {formData.description.length > 450 ? ' ❌' : ' ✅'}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="date">Date</Label>
                                <div className="relative mt-2">
                                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="date"
                                        id="date"
                                        name="date"
                                        className="pl-9"
                                        required
                                        value={formData.date}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="time">Time</Label>
                                <Input
                                    type="time"
                                    id="time"
                                    name="time"
                                    className="mt-2"
                                    required
                                    value={formData.time}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="location">Location</Label>
                            <div className="relative mt-2">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="location"
                                    name="location"
                                    className="pl-9"
                                    placeholder="e.g. Grand Hall, New York"
                                    required
                                    value={formData.location}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <Label htmlFor="category">Category</Label>
                                <div className="relative mt-2">
                                    <Tag className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <select
                                        id="category"
                                        name="category"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9"
                                        value={formData.category}
                                        onChange={handleChange}
                                    >
                                        <option value="General">General</option>
                                        <option value="Music">Music</option>
                                        <option value="Technology">Technology</option>
                                        <option value="Workshop">Workshop</option>
                                        <option value="Sports">Sports</option>
                                        <option value="Arts">Arts</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="price">Price (₹)</Label>
                                <div className="relative mt-2">
                                    <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        id="price"
                                        name="price"
                                        className="pl-9"
                                        placeholder="0"
                                        required
                                        value={formData.price}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="capacity">Capacity</Label>
                                <div className="relative mt-2">
                                    <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        id="capacity"
                                        name="capacity"
                                        className="pl-9"
                                        placeholder="100"
                                        required
                                        value={formData.capacity}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Event Poster section */}
                        <div>
                            <Label htmlFor="poster">Event Poster</Label>
                            {isEditMode && existingPoster && !formData.poster && (
                                <div className="mt-2 relative w-full md:w-64 h-36 rounded-xl overflow-hidden bg-muted border border-border">
                                    <img src={existingPoster} alt="Current poster" className="w-full h-full object-cover" />
                                    <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded backdrop-blur-sm">
                                        Current Poster
                                    </span>
                                </div>
                            )}
                            <div className="mt-2 border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    id="poster"
                                    name="poster"
                                    accept="image/*"
                                    className="absolute inset-0 z-10 opacity-0 cursor-pointer w-full h-full"
                                    onChange={handleChange}
                                />
                                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-4" />
                                {formData.poster ? (
                                    <p className="text-sm font-medium text-rose-500">{formData.poster.name}</p>
                                ) : (
                                    <div>
                                        <p className="text-sm font-medium">Click to upload {isEditMode ? 'new' : ''} image</p>
                                        <p className="text-xs text-muted-foreground mt-1">SVG, PNG, JPG or GIF</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Gallery Images section */}
                        <div className="pt-6 border-t border-border">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <Label className="text-base font-semibold">Event Photo Gallery</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Add up to 6 gallery photos showcasing details/venues (max 5MB each, JPEG/PNG/WebP).
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-rose-500">
                                    {existingGallery.length + galleryFiles.length} / 6
                                </span>
                            </div>

                            {/* Existing Database Photos (In Edit Mode) */}
                            {isEditMode && existingGallery.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Uploaded Images</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        {existingGallery.map((url, index) => (
                                            <div key={`existing-${index}`} className="relative group w-full aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                                                <img src={url} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => deleteExistingGalleryImage(index)}
                                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-rose-600 text-white transition duration-200"
                                                    title="Delete Image"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Local Selection Previews & Reordering */}
                            <div className="space-y-4">
                                {galleryPreviews.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                            New Images to Upload (Drag to Reorder)
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                            {galleryPreviews.map((previewUrl, index) => (
                                                <div
                                                    key={`preview-${index}`}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDrop={(e) => handleDrop(e, index)}
                                                    className={`relative group w-full aspect-square rounded-xl overflow-hidden border border-border bg-muted cursor-move transition-transform duration-200 ${
                                                        draggedIndex === index ? 'scale-95 opacity-50 border-rose-500' : 'hover:scale-[1.02]'
                                                    }`}
                                                >
                                                    <img src={previewUrl} alt={`New Gallery Preview ${index + 1}`} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition duration-200">
                                                        <Move className="w-5 h-5 text-white" />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGalleryFile(index)}
                                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 hover:bg-rose-600 text-white transition duration-200"
                                                        title="Remove Image"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="absolute bottom-2 left-2 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded font-mono font-bold">
                                                        {index + 1}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Styled file input button */}
                                {existingGallery.length + galleryFiles.length < 6 && (
                                    <div className="flex">
                                        <input
                                            type="file"
                                            id="gallery"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleGalleryChange}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => document.getElementById('gallery').click()}
                                            className="w-full sm:w-auto border-dashed border-2 hover:bg-muted/50 transition flex items-center justify-center py-6 px-8 rounded-xl"
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Add Gallery Images
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="flex justify-end pt-6">
                        <Button
                            type="submit"
                            className="bg-rose-500 hover:bg-rose-600 text-white min-w-[150px]"
                            disabled={loading || formData.description.length > 500}
                        >
                            {loading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Event')}
                        </Button>
                    </div>
                </motion.form>
            </div>
        </div>
    );
}
