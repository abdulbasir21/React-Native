import { Ionicons } from "@expo/vector-icons";
import type {
  CategoryDto,
  LocalityDto,
  OwnProviderProfileDto,
  ProviderDashboardDto,
} from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import {
  apiRequest,
  MobileApiError,
  uploadImageRequest,
} from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { CARD_SHADOW } from "../../src/theme/tokens";

export default function ProviderAreaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [experienceYears, setExperienceYears] = useState("1");
  const [isAcceptingWork, setIsAcceptingWork] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [availDay, setAvailDay] = useState("1");
  const [availStart, setAvailStart] = useState("09:00");
  const [availEnd, setAvailEnd] = useState("18:00");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isProvider = user?.roles.includes("PROVIDER") ?? false;

  const { data: profile, isLoading } = useQuery<OwnProviderProfileDto | null>({
    queryKey: ["provider", "me"],
    enabled: Boolean(user && isProvider),
    queryFn: async () => {
      const res = await apiRequest<{ profile: OwnProviderProfileDto }>(
        "/api/v1/provider/me/profile"
      );
      return res.profile;
    },
  });

  const { data: providerStats } = useQuery<ProviderDashboardDto>({
    queryKey: ["provider", "me", "dashboard"],
    enabled: Boolean(user && isProvider),
    queryFn: async () => {
      const res = await apiRequest<{ dashboard: ProviderDashboardDto }>(
        "/api/v1/provider/me/dashboard"
      );
      return res.dashboard;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: async () => {
      const res = await apiRequest<{ categories: CategoryDto[] }>(
        "/api/v1/categories"
      );
      return res.categories;
    },
  });

  const { data: localities = [] } = useQuery({
    queryKey: ["catalog", "localities"],
    queryFn: async () => {
      const res = await apiRequest<{ localities: LocalityDto[] }>(
        "/api/v1/localities"
      );
      return res.localities;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setDescription(profile.description || "");
    setExperienceYears(String(profile.experienceYears ?? 1));
    setIsAcceptingWork(profile.isAcceptingWork);
    if (profile.services[0]) {
      setSelectedCategoryId(profile.services[0].categoryId);
      setServiceTitle(profile.services[0].title);
      setServiceDescription(profile.services[0].description);
    }
    if (profile.serviceArea) {
      setSelectedLocalityId(profile.serviceArea.localityId);
      setRadiusKm(String(profile.serviceArea.radiusKm));
    }
    if (profile.availability[0]) {
      setAvailDay(String(profile.availability[0].dayOfWeek));
      setAvailStart(profile.availability[0].startTime);
      setAvailEnd(profile.availability[0].endTime);
    }
  }, [profile]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["provider", "me"] });
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  const onboardMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ profile: OwnProviderProfileDto }>(
        "/api/v1/provider/me/onboarding",
        { method: "POST", body: JSON.stringify({}) }
      ),
    onSuccess: () => {
      setStatusMsg("Provider profile started.");
      setErrorMsg(null);
      invalidate();
    },
    onError: (err) =>
      setErrorMsg(err instanceof MobileApiError ? err.message : "Failed"),
  });

  const handlePickPhoto = async (mode: "profile" | "portfolio") => {
    setErrorMsg(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Media library permission is required.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const uploaded = await uploadImageRequest(picked.assets[0].uri, mode);
      if (mode === "profile") {
        await apiRequest("/api/v1/provider/me/profile", {
          method: "PUT",
          body: JSON.stringify({
            photoUrl: uploaded.url,
            photoFileId: uploaded.fileId,
          }),
        });
      } else {
        await apiRequest("/api/v1/provider/me/portfolio", {
          method: "POST",
          body: JSON.stringify({
            imageUrl: uploaded.url,
            fileId: uploaded.fileId,
            sortOrder: profile?.portfolio.length ?? 0,
          }),
        });
      }
      setStatusMsg("Image uploaded.");
      invalidate();
    } catch (err) {
      setErrorMsg(err instanceof MobileApiError ? err.message : "Upload failed");
    }
  };

  const handleSaveAll = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiRequest("/api/v1/provider/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName,
          description,
          experienceYears: Number(experienceYears) || 0,
          isAcceptingWork,
        }),
      });

      if (selectedCategoryId && serviceTitle.trim() && serviceDescription.trim()) {
        await apiRequest("/api/v1/provider/me/services", {
          method: "PUT",
          body: JSON.stringify({
            services: [
              {
                categoryId: selectedCategoryId,
                title: serviceTitle,
                description: serviceDescription,
              },
            ],
          }),
        });
      }

      const chosenLoc = localities.find((l) => l.id === selectedLocalityId);
      if (chosenLoc) {
        await apiRequest("/api/v1/provider/me/service-area", {
          method: "PUT",
          body: JSON.stringify({
            localityId: chosenLoc.id,
            lat: chosenLoc.lat,
            lng: chosenLoc.lng,
            radiusKm: Number(radiusKm) || 10,
          }),
        });
      }

      if (availStart && availEnd) {
        await apiRequest("/api/v1/provider/me/availability", {
          method: "PUT",
          body: JSON.stringify({
            windows: [
              {
                dayOfWeek: Number(availDay) || 1,
                startTime: availStart,
                endTime: availEnd,
              },
            ],
          }),
        });
      }

      setStatusMsg("Provider details saved.");
      invalidate();
    } catch (err) {
      setErrorMsg(err instanceof MobileApiError ? err.message : "Save failed");
    }
  };

  const handleSubmitApproval = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiRequest("/api/v1/provider/me/submit", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setStatusMsg("Submitted for admin review.");
      invalidate();
    } catch (err) {
      setErrorMsg(
        err instanceof MobileApiError ? err.message : "Submission failed"
      );
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <View
          style={CARD_SHADOW}
          className="w-full max-w-sm items-center rounded-3xl bg-surface p-6"
        >
          <Ionicons name="briefcase" size={32} color="#0D16A8" />
          <Text className="mt-3 text-base font-bold text-ink">
            Sign in to become a provider
          </Text>
          <View className="mt-4 w-full">
            <Button
              title="Sign in"
              icon="log-in-outline"
              onPress={() => router.push("/(auth)/login")}
            />
          </View>
        </View>
      </View>
    );
  }

  if (!isProvider) {
    return (
      <View className="flex-1 justify-center bg-canvas px-6">
        <View style={CARD_SHADOW} className="rounded-3xl bg-surface p-6">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint">
            <Ionicons name="briefcase" size={24} color="#0D16A8" />
          </View>
          <Text className="mt-4 text-xl font-bold text-ink">
            Become a Service Provider
          </Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Offer your skilled trade services to nearby customers on the same account.
          </Text>
          <View className="mt-5">
            <Button
              title="Start Provider Onboarding"
              icon="arrow-forward"
              loading={onboardMutation.isPending}
              onPress={() => onboardMutation.mutate()}
            />
          </View>
        </View>
      </View>
    );
  }

  if (isLoading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#0D16A8" />
        <Text className="mt-2 text-xs text-muted">
          Loading provider profile...
        </Text>
      </View>
    );
  }

  const latestRejection = profile.verifications.find(
    (v) => v.decision === "REJECTED"
  );
  const serviceableLocalities = localities.filter(
    (l) => l.level === "LOCALITY" && l.isServiceable
  );

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-5">
      <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <View className="rounded-full bg-brand-tint px-3 py-1">
            <Text className="text-xs font-bold uppercase text-brand">
              Status: {profile.status}
            </Text>
          </View>
          <Ionicons name="shield-checkmark" size={20} color="#0D16A8" />
        </View>
        {profile.status === "REJECTED" && latestRejection?.reason ? (
          <Text className="mt-2 text-sm text-danger">
            Feedback: {latestRejection.reason}
          </Text>
        ) : null}
        {providerStats ? (
          <View className="mt-3 flex-row flex-wrap gap-3 border-t border-hairline pt-3">
            <Text className="text-xs font-semibold text-muted">
              Active: {providerStats.activeBookings}
            </Text>
            <Text className="text-xs font-semibold text-muted">
              Completed: {providerStats.completedBookings}
            </Text>
            <Text className="text-xs font-semibold text-muted">
              Pending Offers: {providerStats.pendingOffers}
            </Text>
            <Text className="text-xs font-semibold text-amber-trust">
              Rating: {providerStats.averageRating ?? "—"} (
              {providerStats.reviewCount})
            </Text>
          </View>
        ) : null}
      </View>

      {errorMsg ? (
        <View className="mt-3 rounded-2xl bg-danger-bg p-3.5">
          <Text className="text-sm text-danger">{errorMsg}</Text>
        </View>
      ) : null}
      {statusMsg ? (
        <View className="mt-3 rounded-2xl bg-location-tint p-3.5">
          <Text className="text-sm font-medium text-location-dark">
            {statusMsg}
          </Text>
        </View>
      ) : null}

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-4 rounded-2xl bg-surface p-5"
      >
        <Text className="text-base font-bold text-ink">Profile</Text>
        {profile.photoUrl ? (
          <Image
            source={{ uri: profile.photoUrl }}
            className="h-20 w-20 rounded-full"
          />
        ) : null}
        <Button
          title="Upload Profile Photo"
          variant="secondary"
          icon="camera-outline"
          onPress={() => void handlePickPhoto("profile")}
        />
        <Input
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Input
          label="Bio / description (min 30 chars)"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Input
          label="Experience (years)"
          value={experienceYears}
          onChangeText={setExperienceYears}
          keyboardType="number-pad"
        />
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-ink">
            Accepting work now
          </Text>
          <Switch value={isAcceptingWork} onValueChange={setIsAcceptingWork} />
        </View>
      </View>

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-3 rounded-2xl bg-surface p-5"
      >
        <Text className="text-base font-bold text-ink">Primary Service</Text>
        <View className="flex-row flex-wrap gap-2">
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoryId(cat.id)}
                className={`min-h-[36px] justify-center rounded-full px-3.5 ${
                  active ? "bg-brand" : "border border-hairline bg-canvas"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    active ? "text-white" : "text-ink"
                  }`}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          label="Service title"
          value={serviceTitle}
          onChangeText={setServiceTitle}
        />
        <Input
          label="Service description"
          value={serviceDescription}
          onChangeText={setServiceDescription}
        />
      </View>

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-3 rounded-2xl bg-surface p-5"
      >
        <Text className="text-base font-bold text-ink">Service Area</Text>
        <View className="flex-row flex-wrap gap-2">
          {serviceableLocalities.map((loc) => {
            const active = selectedLocalityId === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => setSelectedLocalityId(loc.id)}
                className={`min-h-[36px] justify-center rounded-full px-3.5 ${
                  active ? "bg-brand" : "border border-hairline bg-canvas"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    active ? "text-white" : "text-ink"
                  }`}
                >
                  {loc.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          label="Service radius (1-30 km)"
          value={radiusKm}
          onChangeText={setRadiusKm}
          keyboardType="number-pad"
        />
      </View>

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-3 rounded-2xl bg-surface p-5"
      >
        <Text className="text-base font-bold text-ink">
          Availability (Asia/Karachi)
        </Text>
        <Input
          label="Day of week (1=Mon..7=Sun)"
          value={availDay}
          onChangeText={setAvailDay}
          keyboardType="number-pad"
        />
        <Input
          label="Start (HH:MM)"
          value={availStart}
          onChangeText={setAvailStart}
        />
        <Input label="End (HH:MM)" value={availEnd} onChangeText={setAvailEnd} />
      </View>

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-3 rounded-2xl bg-surface p-5"
      >
        <Text className="text-base font-bold text-ink">
          Portfolio ({profile.portfolio.length}/10)
        </Text>
        <Button
          title="Add Portfolio Image"
          variant="secondary"
          icon="images-outline"
          onPress={() => void handlePickPhoto("portfolio")}
        />
        <View className="flex-row flex-wrap gap-2">
          {profile.portfolio.map((item) => (
            <View key={item.id} className="items-center gap-1">
              <Image
                source={{ uri: item.imageUrl }}
                className="h-16 w-16 rounded-xl"
              />
              <Pressable
                onPress={() => {
                  void apiRequest(`/api/v1/provider/me/portfolio/${item.id}`, {
                    method: "DELETE",
                  }).then(invalidate);
                }}
                className="min-h-[36px] justify-center px-2"
              >
                <Text className="text-xs font-medium text-danger">Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View className="mb-12 mt-5 gap-3">
        <Button
          title="Save Changes"
          icon="save-outline"
          onPress={() => void handleSaveAll()}
        />
        {profile.status === "DRAFT" || profile.status === "REJECTED" ? (
          <Button
            title="Submit for Approval"
            variant="green"
            icon="checkmark-circle"
            onPress={() => void handleSubmitApproval()}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
