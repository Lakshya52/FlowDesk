import React, { useState, useEffect } from "react";
import { MapPin, Camera, User, Loader2, CheckCircle, Clock, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import CameraCapture from "../common/CameraCapture";

interface Props {
  visitId?: string | null;
  onComplete: (visitId?: string) => void;
  onCancel: () => void;
}

interface LeadOption {
  _id: string;
  name?: string;
  companyName?: string;
  phone?: string;
  city?: string;
  state?: string;
}

interface Campaign {
  _id: string;
  name: string;
  purpose: string;
}

const FieldVisitCheckIn: React.FC<Props> = ({ visitId: preSelectedId, onComplete, onCancel }) => {
  const [step, setStep] = useState<"client" | "selfie" | "confirm">(preSelectedId ? "selfie" : "client");
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>("");
  const [showCamera, setShowCamera] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [locating, setLocating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [visitId, setVisitId] = useState(preSelectedId || "");
  const [loadingVisit, setLoadingVisit] = useState(!!preSelectedId);

  const [showCreateLead, setShowCreateLead] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newLead, setNewLead] = useState({
    name: "",
    phone: "",
    companyName: "",
    city: "",
    state: "",
    addressLine: "",
    campaignId: "",
  });
  const [creatingLead, setCreatingLead] = useState(false);

  useEffect(() => {
    if (preSelectedId) {
      fetchExistingVisit(preSelectedId);
    }
  }, [preSelectedId]);

  const fetchExistingVisit = async (id: string) => {
    try {
      const res = await api.get(`/field-visits/${id}`);
      const visit = res.data.visit;
      if (visit) {
        setSelectedLead({
          _id: visit.clientId,
          name: visit.clientName,
        });
        setStep("selfie");
      }
    } catch {
      toast.error("Failed to load visit details");
    } finally {
      setLoadingVisit(false);
    }
  };

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
        });
        setLocating(false);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
          );
          const data = await res.json();
          if (data.display_name) {
            setLocation((prev) => prev ? { ...prev, address: data.display_name } : null);
          }
        } catch {}
      },
      () => {
        setLocating(false);
        toast.error("Could not get location. Please enable GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await api.get("/leads", { params: { limit: 500 } });
      setLeads(res.data.leads || []);
    } catch {
      toast.error("Failed to load leads");
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await api.get("/campaigns", { params: { limit: 200 } });
      setCampaigns(res.data.campaigns || []);
    } catch {
      toast.error("Failed to load campaigns");
    }
  };

  const openCreateLead = () => {
    fetchCampaigns();
    setShowCreateLead(true);
  };

  const handleCreateLead = async () => {
    if (!newLead.name.trim() || !newLead.campaignId) {
      toast.error("Name and campaign are required");
      return;
    }
    setCreatingLead(true);
    try {
      const res = await api.post("/leads", {
        name: newLead.name.trim(),
        phone: newLead.phone.trim(),
        companyName: newLead.companyName.trim(),
        city: newLead.city.trim(),
        state: newLead.state.trim(),
        addressLine: newLead.addressLine.trim(),
        campaignId: newLead.campaignId,
        source: "field_visit",
      });
      const created = res.data.lead;
      setSelectedLead({
        _id: created._id,
        name: created.name,
        companyName: created.companyName,
        city: created.city,
        state: created.state,
        phone: created.phone,
      });
      setShowCreateLead(false);
      setStep("selfie");
      toast.success("Lead created successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create lead");
    } finally {
      setCreatingLead(false);
    }
  };

  const filteredLeads = leads.filter((c) => {
    if (!leadSearch) return true;
    const q = leadSearch.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.companyName || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  });

  const handleCapture = (blob: Blob) => {
    setSelfieBlob(blob);
    const reader = new FileReader();
    reader.onload = () => setSelfiePreview(reader.result as string);
    reader.readAsDataURL(blob);
    setShowCamera(false);
    setStep("confirm");
  };

  const createAndCheckIn = async () => {
    if (!selectedLead || !selfieBlob || !location) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("selfie", selfieBlob, "selfie.jpg");
      formData.append("clientId", selectedLead._id);
      formData.append("clientType", "lead");
      formData.append("clientName", selectedLead.name || selectedLead.companyName || "");
      formData.append("lat", String(location.lat));
      formData.append("lng", String(location.lng));
      formData.append("address", location.address);
      formData.append("accuracy", "10");

      let currentVisitId = visitId;

      if (!currentVisitId) {
        const createRes = await api.post("/field-visits", {
          clientId: selectedLead._id,
          clientType: "lead",
          clientName: selectedLead.name || selectedLead.companyName || "",
        });
        currentVisitId = createRes.data.visit._id;
        setVisitId(currentVisitId);
      }

      await api.post(`/field-visits/${currentVisitId}/check-in`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Checked in successfully!");
      onComplete(currentVisitId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingVisit) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto text-center">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-600" />
        <p className="text-sm text-gray-500">Loading visit details...</p>
      </div>
    );
  }

  if (showCreateLead) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Create New Lead</h2>
          <button onClick={() => setShowCreateLead(false)} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Campaign *</label>
            <select
              value={newLead.campaignId}
              onChange={(e) => setNewLead((p) => ({ ...p, campaignId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Select campaign...</option>
              {campaigns.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input
              type="text"
              value={newLead.name}
              onChange={(e) => setNewLead((p) => ({ ...p, name: e.target.value }))}
              placeholder="Lead name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input
                type="text"
                value={newLead.phone}
                onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Phone number"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <input
                type="text"
                value={newLead.companyName}
                onChange={(e) => setNewLead((p) => ({ ...p, companyName: e.target.value }))}
                placeholder="Company name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input
                type="text"
                value={newLead.city}
                onChange={(e) => setNewLead((p) => ({ ...p, city: e.target.value }))}
                placeholder="City"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
              <input
                type="text"
                value={newLead.state}
                onChange={(e) => setNewLead((p) => ({ ...p, state: e.target.value }))}
                placeholder="State"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <input
              type="text"
              value={newLead.addressLine}
              onChange={(e) => setNewLead((p) => ({ ...p, addressLine: e.target.value }))}
              placeholder="Address"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreateLead(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleCreateLead}
              disabled={creatingLead || !newLead.name.trim() || !newLead.campaignId}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              {creatingLead && <Loader2 size={14} className="animate-spin" />}
              Create & Proceed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-4 text-gray-900">Field Visit Check-In</h2>

      {step === "client" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Select Lead</span>
          </div>

          <input
            type="text"
            placeholder="Search leads by name, company, phone..."
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredLeads.map((c) => (
              <button
                key={c._id}
                onClick={() => {
                  setSelectedLead(c);
                  setStep("selfie");
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedLead?._id === c._id
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <p className="font-medium text-gray-900">{c.name || c.companyName || "Unnamed"}</p>
                <p className="text-xs text-gray-500">
                  {c.companyName && `${c.companyName}`}{c.city ? ` - ${c.city}` : ""}{c.phone ? ` | ${c.phone}` : ""}
                </p>
              </button>
            ))}
            {filteredLeads.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No leads found</p>
            )}
          </div>

          <button
            onClick={openCreateLead}
            className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors"
          >
            <Plus size={16} /> Create New Lead
          </button>

          {selectedLead && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm text-green-700">
                Selected: {selectedLead.name || selectedLead.companyName}
              </span>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Back
            </button>
            <button
              onClick={() => selectedLead && setStep("selfie")}
              disabled={!selectedLead}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Next: Take Selfie
            </button>
          </div>
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-700 font-medium">
              Lead: {selectedLead?.name || selectedLead?.companyName}
            </p>
            {selectedLead?.phone && (
              <p className="text-xs text-blue-500 mt-0.5">{selectedLead.phone}</p>
            )}
          </div>

          {visitId && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock size={12} />
              <span>Scheduled visit — checking in now</span>
            </div>
          )}

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            {selfiePreview ? (
              <img src={selfiePreview} alt="Selfie" className="max-h-48 mx-auto rounded-lg" />
            ) : (
              <div className="text-gray-400">
                <Camera size={40} className="mx-auto mb-2" />
                <p className="text-sm">Take a geo-tagged selfie at the lead location</p>
              </div>
            )}
          </div>

          {!locating && location && (
            <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
              <MapPin size={14} className="mt-0.5 text-red-500 shrink-0" />
              <span className="break-all">{location.address}</span>
            </div>
          )}
          {locating && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Getting your location...
            </div>
          )}
          {!locating && !location && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-600">
                <MapPin size={14} className="shrink-0" />
                <span>Location not detected. Please enable GPS and try again.</span>
              </div>
              <button
                onClick={() => {
                  setLocating(true);
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      setLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        address: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
                      });
                      setLocating(false);
                      try {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
                        );
                        const data = await res.json();
                        if (data.display_name) {
                          setLocation((prev) => prev ? { ...prev, address: data.display_name } : null);
                        }
                      } catch {}
                    },
                    () => {
                      setLocating(false);
                      toast.error("Could not get location. Please enable GPS.");
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
                className="flex items-center justify-center gap-1.5 w-full py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <MapPin size={16} /> Recheck Location
              </button>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => !visitId && setStep("client")} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              {visitId ? (
                <span className="text-gray-400 cursor-not-allowed">Back</span>
              ) : "Back"}
            </button>
            <button
              onClick={() => setShowCamera(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Open Camera
            </button>
          </div>

          {showCamera && (
            <CameraCapture
              onCapture={handleCapture}
              onClose={() => setShowCamera(false)}
            />
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">Ready to check in</p>
              <p className="text-xs text-green-600">
                {selectedLead?.name || selectedLead?.companyName}
              </p>
            </div>
          </div>

          {selfiePreview && (
            <img src={selfiePreview} alt="Selfie preview" className="max-h-32 mx-auto rounded-lg" />
          )}

          {location && (
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <MapPin size={14} className="mt-0.5 text-red-500 shrink-0" />
              <span className="break-all">{location.address}</span>
            </div>
          )}

          {!location && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-600">
                <MapPin size={14} className="shrink-0" />
                <span>Location not detected. Check-in requires GPS location.</span>
              </div>
              <button
                onClick={() => {
                  setLocating(true);
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      setLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        address: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
                      });
                      setLocating(false);
                      try {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
                        );
                        const data = await res.json();
                        if (data.display_name) {
                          setLocation((prev) => prev ? { ...prev, address: data.display_name } : null);
                        }
                      } catch {}
                    },
                    () => {
                      setLocating(false);
                      toast.error("Could not get location. Please enable GPS.");
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
                className="flex items-center justify-center gap-1.5 w-full py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <MapPin size={16} /> Recheck Location
              </button>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep("selfie")} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Back
            </button>
            <button
              onClick={createAndCheckIn}
              disabled={submitting || !location}
              className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Confirm Check-In
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldVisitCheckIn;
