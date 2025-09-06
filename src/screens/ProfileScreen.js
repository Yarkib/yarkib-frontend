import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import RiderCard from '../components/RiderCard';

const ProfileScreen = () => {
  const { user } = useAuth();

  const [summary, setSummary] = useState(user?.summary || '');
  const [savedRoutes] = useState([
    { id: 'r1', name: 'City River Loop', distance_km: 12.4 },
    { id: 'r2', name: 'Scenic Mountain Trail', distance_km: 18.9 },
  ]);
  const [completedRides] = useState([
    { id: 'c1', name: 'Morning Commute', distance_km: 6.1 },
    { id: 'c2', name: 'Weekend Long Ride', distance_km: 32.7 },
    { id: 'c3', name: 'Evening Sprint', distance_km: 8.3 },
  ]);
  const [favouriteCategories] = useState(['Scenic', 'Urban', 'Gravel']);
  const [cardVisible, setCardVisible] = useState(false);

  const totalDistance = useMemo(
    () => completedRides.reduce((acc, r) => acc + (r.distance_km || 0), 0),
    [completedRides]
  );

  const renderRoute = ({ item }) => (
    <View style={styles.itemRow}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      <Text style={styles.itemMeta}>{(item.distance_km || 0).toFixed(1)} km</Text>
    </View>
  );

  const renderRide = ({ item }) => (
    <View style={styles.itemRow}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      <Text style={styles.itemMeta}>{(item.distance_km || 0).toFixed(1)} km</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
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
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalDistance.toFixed(1)} km</Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{completedRides.length}</Text>
          <Text style={styles.statLabel}>Completed Rides</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{savedRoutes.length}</Text>
          <Text style={styles.statLabel}>Saved Routes</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Favourite Categories</Text>
        <View style={styles.chipsRow}>
          {favouriteCategories.map((cat) => (
            <View key={cat} style={styles.chip}>
              <Text style={styles.chipText}>{cat}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
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
          onPress={() => {
            // TODO: Wire to backend endpoint when available
          }}
        >
          <Text style={styles.saveBtnText}>Save Summary</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Saved Routes</Text>
        </View>
        <FlatList
          data={savedRoutes}
          keyExtractor={(item) => item.id}
          renderItem={renderRoute}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>No saved routes yet.</Text>}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Completed Rides</Text>
        </View>
        <FlatList
          data={completedRides}
          keyExtractor={(item) => item.id}
          renderItem={renderRide}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>No rides recorded yet.</Text>}
        />
      </View>

      <TouchableOpacity style={styles.cardBtn} onPress={() => setCardVisible(true)}>
        <Ionicons name="card" size={18} color="white" />
        <Text style={styles.cardBtnText}>Preview Rider Card</Text>
      </TouchableOpacity>

      <Modal visible={cardVisible} transparent animationType="slide" onRequestClose={() => setCardVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <RiderCard user={user} onClose={() => setCardVisible(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.lg },
  avatarWrap: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', backgroundColor: theme.colors.inputBackground },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { marginLeft: theme.spacing.md },
  name: { ...theme.typography.h2 },
  email: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  statCard: { flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: theme.spacing.md },
  statValue: { ...theme.typography.h3 },
  statLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 },
  section: { marginBottom: theme.spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...theme.typography.h4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: theme.spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.colors.inputBackground, borderRadius: 16 },
  chipText: { ...theme.typography.caption },
  textArea: { minHeight: 90, borderWidth: 1, borderColor: theme.colors.inputBackground, borderRadius: 10, padding: 12, backgroundColor: theme.colors.surface, textAlignVertical: 'top' },
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

export default ProfileScreen;


