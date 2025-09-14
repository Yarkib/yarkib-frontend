import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Image, TextInput, FlatList, Modal, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { theme } from '../src/theme';
import RiderCard from '../src/components/RiderCard';
import { getBaseUrl } from '../src/utils/api';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';

const Profile = () => {
  const { user, session } = useAuth() as { user: any; session?: { access_token?: string } };
  const [showCard, setShowCard] = React.useState(false);
  const [summary, setSummary] = useState<string>(user?.summary || '');
  const [savedRoutes, setSavedRoutes] = useState<{id: string; name: string; distance_km: number}[]>([]);
  const [completedRides, setCompletedRides] = useState<{id: string; name: string; distance_km: number}[]>([]);
  const [favouriteCategories, setFavouriteCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);

  // Load real profile data
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!user?.id) {
          console.log('[PROFILE] User not authenticated');
          setError('Please log in to view profile data');
          setLoading(false);
          return;
        }

        console.log('[PROFILE] Fetching profile data for user:', user.id);

        // Fetch saved routes using direct endpoint
        const savedRoutesResponse = await fetch(`${getBaseUrl()}/user/routes/saved/${user.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });

        // Fetch completed routes using direct endpoint
        const completedRoutesResponse = await fetch(`${getBaseUrl()}/user/routes/completed/${user.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });

        // Fetch user profile data
        const profileResponse = await fetch(`${getBaseUrl()}/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });

        // Fetch user stats for total distance
        const statsResponse = await fetch(`${getBaseUrl()}/me/stats`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });

        if (!isMounted) return;

        // Process saved routes
        let savedRoutesData = [];
        if (savedRoutesResponse.ok) {
          const savedData = await savedRoutesResponse.json();
          savedRoutesData = savedData.routes || savedData || [];
          console.log(`[PROFILE] Received ${savedRoutesData.length} saved routes`);
        } else {
          console.log('[PROFILE] Failed to fetch saved routes:', savedRoutesResponse.status);
        }

        // Process completed routes
        let completedRoutesData = [];
        if (completedRoutesResponse.ok) {
          const completedData = await completedRoutesResponse.json();
          completedRoutesData = completedData.routes || completedData || [];
          console.log(`[PROFILE] Received ${completedRoutesData.length} completed routes`);
        } else {
          console.log('[PROFILE] Failed to fetch completed routes:', completedRoutesResponse.status);
        }

        // Process profile data
        let profileData = null;
        if (profileResponse.ok) {
          profileData = await profileResponse.json();
          console.log('[PROFILE] Received profile data');
        } else {
          console.log('[PROFILE] Failed to fetch profile data:', profileResponse.status);
        }

        // Process stats data
        let statsData = null;
        if (statsResponse.ok) {
          statsData = await statsResponse.json();
          console.log('[PROFILE] Received stats data');
        } else {
          console.log('[PROFILE] Failed to fetch stats data:', statsResponse.status);
        }

        // Update state
        if (profileData?.summary) setSummary(profileData.summary);
        if (Array.isArray(profileData?.favourite_categories)) {
          setFavouriteCategories(profileData.favourite_categories);
        }

        // Set total distance from stats or calculate from completed rides
        if (statsData?.total_distance_km != null) {
          setTotalDistance(Number(statsData.total_distance_km));
          console.log('[PROFILE] Using backend total distance:', statsData.total_distance_km);
        } else {
          // Fallback: calculate from completed rides
          const calculatedDistance = completedRoutesData.reduce((acc: number, r: any) => acc + (r.distance_km || r.distance || 0), 0);
          setTotalDistance(calculatedDistance);
          console.log('[PROFILE] Calculated total distance from completed rides:', calculatedDistance);
        }

        setSavedRoutes(savedRoutesData.map((r: any) => ({
          id: String(r.id || r._id || r.route_id),
          name: r.name || r.title || r.route_name || 'Route',
          distance_km: Number(r.distance_km || r.distance || 0),
        })));

        setCompletedRides(completedRoutesData.map((c: any) => ({
          id: String(c.id || c._id || c.ride_id || c.route_id),
          name: c.name || c.title || c.route_name || 'Ride',
          distance_km: Number(c.distance_km || c.distance || 0),
        })));

        setError(null);
      } catch (e) {
        if (isMounted) {
          console.error('[PROFILE] Error fetching profile data:', e);
          setError((e as Error).message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [user?.id, session?.access_token]);

  const renderSimpleRow = ({ item }: { item: { id: string; name: string; distance_km: number } }) => (
    <View style={styles.itemRow}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      <Text style={styles.itemMeta}>{(item.distance_km || 0).toFixed(1)} km</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <BlurView intensity={60} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.glassHeader}>
          <View style={styles.avatarWrap}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={theme.colors.primary} />
              </View>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name}>{user?.name || user?.email || 'Rider'}</Text>
            {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
          </View>
        </BlurView>

        {loading && (
          <Text style={styles.loadingText}>Loading profile…</Text>
        )}
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <View style={styles.statsRow}>
          <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.statCardGlass}>
            <Text style={styles.statValue}>{totalDistance.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Total Distance</Text>
          </BlurView>
          <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.statCardGlass}>
            <Text style={styles.statValue}>{completedRides.length}</Text>
            <Text style={styles.statLabel}>Completed Rides</Text>
          </BlurView>
          <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.statCardGlass}>
            <Text style={styles.statValue}>{savedRoutes.length}</Text>
            <Text style={styles.statLabel}>Saved Routes</Text>
          </BlurView>
        </View>

        <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.sectionGlass}>
          <Text style={styles.sectionTitle}>Favourite Categories</Text>
          <View style={styles.chipsRow}>
            {favouriteCategories.map((cat) => (
              <View key={cat} style={styles.chip}>
                <Text style={styles.chipText}>{cat}</Text>
              </View>
            ))}
          </View>
        </BlurView>

        <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.sectionGlass}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <TextInput
            style={styles.textArea}
            value={summary}
            placeholder="Add a short summary about yourself…"
            multiline
            onChangeText={setSummary}
          />
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={async () => {
              if (!user?.id) {
                Alert.alert('Error', 'Please log in to update profile');
                return;
              }

              try {
                setError(null);
                const response = await fetch(`${getBaseUrl()}/me/summary`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
                  },
                  body: JSON.stringify({ summary })
                });

                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
                }

                Alert.alert('Success', 'Summary updated successfully!');
              } catch (e) {
                console.error('[PROFILE] Error updating summary:', e);
                setError((e as Error).message);
              }
            }}
          >
            <Text style={styles.saveBtnText}>Save Summary</Text>
          </TouchableOpacity>
        </BlurView>

        <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.sectionGlass}>
          <Text style={styles.sectionTitle}>Saved Routes</Text>
          <FlatList
            data={savedRoutes}
            keyExtractor={(item) => item.id}
            renderItem={renderSimpleRow}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={<Text style={styles.empty}>No saved routes yet.</Text>}
          />
        </BlurView>

        <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.sectionGlass}>
          <Text style={styles.sectionTitle}>Completed Rides</Text>
          <FlatList
            data={completedRides}
            keyExtractor={(item) => item.id}
            renderItem={renderSimpleRow}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={<Text style={styles.empty}>No rides recorded yet.</Text>}
          />
        </BlurView>

        <TouchableOpacity style={styles.cardBtn} onPress={() => setShowCard(true)}>
          <Ionicons name="card" size={18} color="white" />
          <Text style={styles.cardBtnText}>Preview Rider Card</Text>
        </TouchableOpacity>

        {/* User Info Card */}

        <Modal visible={showCard} transparent animationType="slide" onRequestClose={() => setShowCard(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <RiderCard user={user} onClose={() => setShowCard(false)} />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.lg },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.inputBackground, alignItems: 'center', justifyContent: 'center' },
  title: { ...theme.typography.h3 },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  glassHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: theme.spacing.lg, 
    borderRadius: 16,
    padding: theme.spacing.md,
    overflow: 'hidden',
  },
  avatarWrap: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', backgroundColor: theme.colors.inputBackground },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { marginLeft: theme.spacing.md },
  name: { ...theme.typography.h2 },
  email: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  statCardGlass: { flex: 1, borderRadius: 14, padding: theme.spacing.md, overflow: 'hidden' },
  statValue: { ...theme.typography.h3 },
  statLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 },
  loadingText: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  errorText: { ...theme.typography.caption, color: '#C62828', marginBottom: theme.spacing.sm },
  section: { marginBottom: theme.spacing.lg },
  sectionGlass: { borderRadius: 16, padding: theme.spacing.md, marginBottom: theme.spacing.lg, overflow: 'hidden' },
  sectionTitle: { ...theme.typography.h4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: theme.spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.colors.inputBackground, borderRadius: 16 },
  chipText: { ...theme.typography.caption },
  textArea: { minHeight: 90, borderWidth: 1, borderColor: theme.colors.inputBackground, borderRadius: 10, padding: 12, backgroundColor: theme.colors.inputBackground, textAlignVertical: 'top' },
  saveBtn: { alignSelf: 'flex-start', backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginTop: theme.spacing.sm },
  saveBtnText: { color: 'white', ...theme.typography.bodyBold },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  itemTitle: { ...theme.typography.body },
  itemMeta: { ...theme.typography.caption, color: theme.colors.textSecondary },
  sep: { height: 1, backgroundColor: theme.colors.inputBackground },
  empty: { ...theme.typography.caption, color: theme.colors.textSecondary, paddingVertical: 8 },
  cardBtn: { marginTop: theme.spacing.md, backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cardBtnText: { color: 'white', ...theme.typography.bodyBold },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 12, overflow: 'hidden' },
});

export default Profile;


