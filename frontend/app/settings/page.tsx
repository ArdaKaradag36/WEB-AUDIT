"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import {
  defaultNotificationSettings,
  defaultProfileSettings,
  defaultRunnerSettings,
  loadNotificationSettings,
  loadProfileSettings,
  loadRunnerSettings,
  NotificationSettings,
  ProfileSettings,
  RunnerSettings,
  saveNotificationSettings,
  saveProfileSettings,
  saveRunnerSettings
} from "../../lib/settingsStorage";

type ToastState = { message: string; type: "success" | "error" } | null;

function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  function show(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast(null);
    }, 2500);
  }

  return { toast, show };
}

function SettingsInner() {
  const [profile, setProfile] = useState<ProfileSettings>(defaultProfileSettings);
  const [runner, setRunner] = useState<RunnerSettings>(defaultRunnerSettings);
  const [notifications, setNotifications] = useState<NotificationSettings>(
    defaultNotificationSettings
  );

  const [initialProfile, setInitialProfile] =
    useState<ProfileSettings>(defaultProfileSettings);
  const [initialRunner, setInitialRunner] =
    useState<RunnerSettings>(defaultRunnerSettings);
  const [initialNotifications, setInitialNotifications] =
    useState<NotificationSettings>(defaultNotificationSettings);

  const [profileErrors, setProfileErrors] = useState<{ fullName?: string }>({});
  const [notifyErrors, setNotifyErrors] = useState<{ emailAddress?: string }>({});

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingRunner, setSavingRunner] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const { toast, show } = useToast();

  useEffect(() => {
    (async () => {
      const loadedProfile = await loadProfileSettings();
      const loadedRunner = await loadRunnerSettings();
      const loadedNotify = await loadNotificationSettings();

      setProfile(loadedProfile);
      setInitialProfile(loadedProfile);

      setRunner(loadedRunner);
      setInitialRunner(loadedRunner);

      const notifyWithEmail: NotificationSettings = {
        ...loadedNotify,
        emailAddress:
          loadedNotify.emailAddress ||
          loadedProfile.email ||
          defaultNotificationSettings.emailAddress
      };
      setNotifications(notifyWithEmail);
      setInitialNotifications(notifyWithEmail);
    })();
  }, []);

  const profileDirty = useMemo(
    () =>
      profile.fullName !== initialProfile.fullName ||
      profile.organization !== initialProfile.organization ||
      profile.email !== initialProfile.email,
    [profile, initialProfile]
  );

  const runnerDirty = useMemo(
    () => JSON.stringify(runner) !== JSON.stringify(initialRunner),
    [runner, initialRunner]
  );

  const notificationsDirty = useMemo(
    () => JSON.stringify(notifications) !== JSON.stringify(initialNotifications),
    [notifications, initialNotifications]
  );

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const errors: { fullName?: string } = {};
    if (!profile.fullName.trim()) {
      errors.fullName = "Ad Soyad alanı zorunludur.";
    }
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingProfile(true);
    try {
      await saveProfileSettings(profile);
      setInitialProfile(profile);
      show("Profil ayarları güncellendi.", "success");
    } catch {
      show("Profil ayarları kaydedilemedi.", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  function resetRunnerToDefaults() {
    setRunner(defaultRunnerSettings);
  }

  async function handleSaveRunner(e: React.FormEvent) {
    e.preventDefault();
    setSavingRunner(true);
    try {
      await saveRunnerSettings(runner);
      setInitialRunner(runner);
      show("Runner ayarları güncellendi.", "success");
    } catch {
      show("Runner ayarları kaydedilemedi.", "error");
    } finally {
      setSavingRunner(false);
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    const errors: { emailAddress?: string } = {};
    if (notifications.emailEnabled) {
      const email = notifications.emailAddress.trim();
      if (!email) {
        errors.emailAddress = "Bildirim e-posta adresi zorunludur.";
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.emailAddress = "Geçerli bir e-posta adresi giriniz.";
      }
    }
    setNotifyErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingNotifications(true);
    try {
      await saveNotificationSettings(notifications);
      setInitialNotifications(notifications);
      show("Bildirim tercihleri güncellendi.", "success");
    } catch {
      show("Bildirim tercihleri kaydedilemedi.", "error");
    } finally {
      setSavingNotifications(false);
    }
  }

  return (
    <div className="settings-page">
      <section className="settings-intro">
        <h1>Ayarlar</h1>
        <p>Hesap ve ürün seviyesinde yapılandırmalar.</p>
      </section>

      <section className="settings-grid">
        <article className="card">
          <div className="card-header">
            <h2>Profil Bilgileri</h2>
            <p>Hesabına ait temel kimlik ve rol bilgileri.</p>
          </div>
          <form className="card-body" onSubmit={handleSaveProfile}>
            <div className="settings-profile-header">
              <div className="settings-avatar">
                <span>
                  {profile.fullName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(part => part.charAt(0).toUpperCase())
                    .join("") || "AU"}
                </span>
              </div>
              <div className="settings-profile-meta">
                <span className="settings-profile-name">
                  {profile.fullName || "Admin Kullanıcı"}
                </span>
                <span className="settings-profile-email">
                  {profile.email || "ornek.kullanici@kurum.gov.tr"}
                </span>
              </div>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">Ad Soyad</span>
              <input
                type="text"
                value={profile.fullName}
                onChange={e =>
                  setProfile(prev => ({ ...prev, fullName: e.target.value }))
                }
                placeholder="Ad Soyad"
              />
              {profileErrors.fullName && (
                <span className="settings-field-error">{profileErrors.fullName}</span>
              )}
            </label>

            <label className="settings-field">
              <span className="settings-field-label">E-posta</span>
              <input
                type="email"
                value={profile.email}
                onChange={e =>
                  setProfile(prev => ({ ...prev, email: e.target.value }))
                }
                placeholder="ornek.kullanici@kurum.gov.tr"
              />
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Kurum / Birim</span>
              <input
                type="text"
                value={profile.organization}
                onChange={e =>
                  setProfile(prev => ({ ...prev, organization: e.target.value }))
                }
                placeholder="Kamu kurumu veya birim adı (isteğe bağlı)"
              />
            </label>

            <div className="settings-field settings-inline">
              <div>
                <span className="settings-field-label">Rol</span>
                <div className="settings-role-badge">
                  <span className="badge-role">
                    {profile.role === "Admin" ? "Admin" : "Kullanıcı"}
                  </span>
                </div>
              </div>
            </div>

            <div className="settings-field">
              <span className="settings-field-label">Profil Görseli</span>
              <div className="settings-avatar-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled
                  title="Yakında"
                >
                  Görsel Yükle
                </button>
                <span className="settings-helper-text">
                  Yakında profil görseli yükleme desteği eklenecek.
                </span>
              </div>
            </div>

            <div className="settings-actions-row">
              <button
                type="submit"
                className="primary-button"
                disabled={savingProfile || !profileDirty}
              >
                {savingProfile ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled
                title="Yakında"
              >
                Şifre Değiştir
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>API / Runner Ayarları</h2>
            <p>Denetim motoru ve çalıştırma davranışını etkileyen yapılandırmalar.</p>
          </div>
          <form className="card-body" onSubmit={handleSaveRunner}>
            <label className="settings-field">
              <span className="settings-field-label">Çalıştırma Modu</span>
              <select
                value={runner.mode}
                onChange={e =>
                  setRunner(prev => ({
                    ...prev,
                    mode: e.target.value as RunnerSettings["mode"]
                  }))
                }
              >
                <option value="headless">Headless</option>
                <option value="debug">Görünür (Debug)</option>
              </select>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Tarayıcı</span>
              <select
                value={runner.browser}
                onChange={e =>
                  setRunner(prev => ({
                    ...prev,
                    browser: e.target.value as RunnerSettings["browser"]
                  }))
                }
              >
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </select>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Maksimum Link Sayısı</span>
              <input
                type="number"
                min={1}
                max={200}
                value={runner.maxLinks}
                onChange={e =>
                  setRunner(prev => ({
                    ...prev,
                    maxLinks: Number(e.target.value || 1)
                  }))
                }
              />
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Zaman Aşımı (sn)</span>
              <input
                type="number"
                min={10}
                max={600}
                value={runner.timeoutSeconds}
                onChange={e =>
                  setRunner(prev => ({
                    ...prev,
                    timeoutSeconds: Number(e.target.value || 10)
                  }))
                }
              />
            </label>

            <div className="settings-toggle-group">
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">Ekran Görüntüsü Al</span>
                </div>
                <input
                  type="checkbox"
                  checked={runner.screenshot}
                  onChange={e =>
                    setRunner(prev => ({ ...prev, screenshot: e.target.checked }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">Trace Kaydı</span>
                </div>
                <input
                  type="checkbox"
                  checked={runner.trace}
                  onChange={e =>
                    setRunner(prev => ({ ...prev, trace: e.target.checked }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">Strict Mode</span>
                  <p className="settings-helper-text">
                    Açık olduğunda, küçük sapmalar bile bulgu olarak raporlanır.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={runner.strictMode}
                  onChange={e =>
                    setRunner(prev => ({ ...prev, strictMode: e.target.checked }))
                  }
                />
              </label>
            </div>

            <div className="settings-actions-row">
              <button
                type="submit"
                className="primary-button"
                disabled={savingRunner || !runnerDirty}
              >
                {savingRunner ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={resetRunnerToDefaults}
                disabled={savingRunner}
              >
                Varsayılana Sıfırla
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Bildirim Tercihleri</h2>
            <p>Denetim sonuçları ve sistem uyarıları için bildirim kanalları.</p>
          </div>
          <form className="card-body" onSubmit={handleSaveNotifications}>
            <div className="settings-toggle-group">
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">E-posta Bildirimleri</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.emailEnabled}
                  onChange={e =>
                    setNotifications(prev => ({
                      ...prev,
                      emailEnabled: e.target.checked
                    }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">
                    Denetim Tamamlandı Bildirimi
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.onCompleted}
                  onChange={e =>
                    setNotifications(prev => ({
                      ...prev,
                      onCompleted: e.target.checked
                    }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">
                    Denetim Başarısız Bildirimi
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.onFailed}
                  onChange={e =>
                    setNotifications(prev => ({
                      ...prev,
                      onFailed: e.target.checked
                    }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">
                    Kritik Bulgu Bulunursa Bildir
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.onCriticalFinding}
                  onChange={e =>
                    setNotifications(prev => ({
                      ...prev,
                      onCriticalFinding: e.target.checked
                    }))
                  }
                />
              </label>
              <label className="settings-toggle-row">
                <div>
                  <span className="settings-field-label">Haftalık Özet</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.weeklySummary}
                  onChange={e =>
                    setNotifications(prev => ({
                      ...prev,
                      weeklySummary: e.target.checked
                    }))
                  }
                />
              </label>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">Bildirim E-posta Adresi</span>
              <input
                type="email"
                value={notifications.emailAddress}
                onChange={e =>
                  setNotifications(prev => ({
                    ...prev,
                    emailAddress: e.target.value
                  }))
                }
                placeholder="ornek.kullanici@kurum.gov.tr"
              />
              {notifyErrors.emailAddress && (
                <span className="settings-field-error">{notifyErrors.emailAddress}</span>
              )}
            </label>

            <div className="settings-actions-row">
              <button
                type="submit"
                className="primary-button"
                disabled={savingNotifications || !notificationsDirty}
              >
                {savingNotifications ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>
        </article>
      </section>

      {toast && (
        <div
          className={
            toast.type === "success" ? "toast toast-success" : "toast toast-error"
          }
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsInner />
    </ProtectedRoute>
  );
}

