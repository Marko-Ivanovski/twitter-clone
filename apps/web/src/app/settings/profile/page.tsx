'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { updateProfile } from '@/lib/users';
import { Modal } from '@/components/ui/Modal';
import { checkPasswordStrength } from '@/utils/validation';
import { uploadImage, validateImageFile } from '@/lib/uploads';
import { RequireAuth } from '@/components/RequireAuth';

export default function EditProfilePage() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'profile'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile Form State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.avatarUrl || null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Sync state with user data when it loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setPreviewUrl(user.avatarUrl ? encodeURI(user.avatarUrl) : null);
    }
  }, [user]);

  // Modals State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Email Modal State
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [confirmNewEmail, setConfirmNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password Modal State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [passwordSubmitError, setPasswordSubmitError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Handlers
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateImageFile(file);
      if (validationError) {
        setAvatarError(validationError);
        e.target.value = '';
        return;
      }

      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      setAvatarFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAvatarError(null);
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;
    return uploadImage(avatarFile, 'avatars');
  };

  const handleRemoveAvatar = async () => {
    if (!previewUrl || removingAvatar) return;
    setRemovingAvatar(true);
    setMessage(null);

    try {
      await updateProfile({ avatarUrl: null });
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setAvatarFile(null);
      setPreviewUrl(null);
      setAvatarError(null);
      await refreshUser();
      setMessage({ type: 'success', text: 'Profile photo removed successfully' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to remove profile photo') });
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      let avatarUrl = undefined;
      if (avatarFile) {
        avatarUrl = await uploadAvatar() || undefined;
      }

      await updateProfile({
        displayName,
        bio,
        ...(avatarUrl ? { avatarUrl } : {}),
      });
      
      await refreshUser();
      setAvatarFile(null); // Clear the file so preview uses the server URL
      setAvatarError(null);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (err) {
       console.error(err);
       setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to update profile') });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    if (newEmail !== confirmNewEmail) {
      setEmailError('New emails do not match.');
      return;
    }

    if (newEmail.toLowerCase() === user?.email.toLowerCase()) {
      setEmailError('New email must be different.');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({ email: newEmail, currentPassword: emailCurrentPassword });
      await refreshUser();
      setIsEmailModalOpen(false);
      setMessage({ type: 'success', text: 'Email updated successfully' });
      // Reset form
      setEmailCurrentPassword('');
      setNewEmail('');
      setConfirmNewEmail('');
    } catch (err) {
      console.error(err);
      setEmailError(getErrorMessage(err, 'Failed to update email'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeInput = (pwd: string) => {
      setNewPassword(pwd);
      setPasswordErrors(checkPasswordStrength(pwd));
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSubmitError(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordSubmitError('Passwords do not match');
      return;
    }

    if (passwordErrors.length > 0) {
        return; // UI should disable button, but double check
    }

    setLoading(true);
    try {
      await updateProfile({ password: newPassword, currentPassword });
      setIsPasswordModalOpen(false);
      setMessage({ type: 'success', text: 'Password updated successfully' });
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordErrors([]);
    } catch (err) {
      console.error(err);
      setPasswordSubmitError(getErrorMessage(err, 'Failed to update password'));
    } finally {
      setLoading(false);
    }
  };

  const hasAvatar = Boolean(previewUrl);

  const content = user ? (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-slate-100">Edit Profile</h1>
      
      {message && (
        <div className={`mb-6 rounded-lg p-4 ${
          message.type === 'success'
            ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/60'
            : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/60'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[250px_1fr]">
        <aside>
          <nav className="flex flex-col space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Profile Information
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === 'account'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Account Settings
            </button>
          </nav>
        </aside>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:border-slate-800 dark:bg-slate-900">
          {activeTab === 'profile' ? (
            <form onSubmit={handleProfileSave} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-slate-300">
                  Profile Photo
                </label>
                <div className="flex items-center gap-6">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-gray-200 dark:border-slate-700">
                    {previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                        onError={() => setPreviewUrl(null)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500">
                        No Photo
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      Change Photo
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                    </label>
                    {hasAvatar && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={removingAvatar || loading}
                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                      >
                        {removingAvatar ? 'Removing...' : 'Remove Photo'}
                      </button>
                    )}
                  </div>
                </div>
                {avatarError && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{avatarError}</p>}
              </div>

              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Display Name
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 sm:text-sm p-2 border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                  placeholder="Your Name"
                />
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Bio
                </label>
                <textarea
                  id="bio"
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 sm:text-sm p-2 border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                  placeholder="Tell us about yourself"
                />
              </div>

            <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-gray-900 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">Email Address</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Current email: <span className="font-semibold text-gray-900 dark:text-slate-100">{user.email}</span>
                </p>
                <button
                  onClick={() => setIsEmailModalOpen(true)}
                  className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  type="button"
                >
                  Change Email
                </button>
              </div>

              <div className="border-t border-gray-200 pt-6 dark:border-slate-800">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">Password</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Update your password associated with your account.
                </p>
                <button
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  type="button"
                >
                  Change Password
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change Email Modal */}
      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Change Email"
      >
        <form onSubmit={handleEmailSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Current Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={emailCurrentPassword}
                onChange={e => setEmailCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                placeholder="Enter your password"
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">New Email</label>
              <input 
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                placeholder="Enter new email"
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Confirm New Email</label>
              <input 
                type="email"
                required
                value={confirmNewEmail}
                onChange={e => setConfirmNewEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                placeholder="Confirm new email"
              />
            </div>
            {emailError && <p className="text-sm text-red-600 dark:text-red-300">{emailError}</p>}
            <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading || !newEmail || !emailCurrentPassword || !confirmNewEmail}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-full disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Password"
      >
        <form onSubmit={handlePasswordSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Current Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                placeholder="Current password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">New Password</label>
              <div className="relative">
                <input 
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => handlePasswordChangeInput(e.target.value)}
                  className="w-full rounded-md border border-gray-300 p-2 pr-10 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                  placeholder="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            
            {passwordErrors.length > 0 && (
                <div className="text-xs text-red-600 space-y-1 dark:text-red-300">
                    <p className="font-semibold text-gray-700 dark:text-slate-200">Password requirements:</p>
                    <ul className="list-disc pl-4">
                        {passwordErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Confirm New Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="w-full rounded-md border border-gray-300 p-2 pr-10 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {passwordSubmitError && <p className="text-sm text-red-600 dark:text-red-300">{passwordSubmitError}</p>}
            <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading || !currentPassword || !newPassword || !confirmNewPassword || passwordErrors.length > 0}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-full disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  ) : null;

  return <RequireAuth>{content}</RequireAuth>;
}
