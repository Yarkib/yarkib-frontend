import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Platform,
  Modal,
  Switch,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import RouteCard from '../src/components/RouteCard';
import Sidebar from '../src/components/Sidebar';
import { theme } from '../src/theme/index';
import { getBaseUrl, MOCK_MODE, notificationsApi } from '../src/utils/api';
import { Route } from '../src/types/route';
import { router } from 'expo-router';

const HomeScreen = () => {
  const { user } = useAuth() as AuthContextType;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>('all'); // Default to 'all' to show everything
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Filter states - using more inclusive defaults
  const [minDistance, setMinDistance] = useState("0"); // km
  const [maxDistance, setMaxDistance] = useState("110000"); // km - much higher default
  const [minDuration, setMinDuration] = useState("0"); // minutes
  const [maxDuration, setMaxDuration] = useState("158400"); // minutes - much higher default
  const [showEasyRoutes, setShowEasyRoutes] = useState(true);
  const [showIntermediateRoutes, setShowIntermediateRoutes] = useState(true);
  const [showHardRoutes, setShowHardRoutes] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  // Define the Category type for better type safety
  interface Category {
    id: string;
    name: string;
    icon: string;
    description?: string;
  }
  
  const [categories, setCategories] = useState<Category[]>([
    { id: 'all', name: 'All', icon: 'globe-outline' } // Default "All" category
  ]);

  const fetchRoutes = useCallback(async () => {
    try {
      const baseUrl = getBaseUrl();
      console.log('[INFO] Fetching routes from backend...');
      console.log('[INFO] Backend URL:', baseUrl);
      console.log('[INFO] Mock mode:', MOCK_MODE);
      console.log('[INFO] User authenticated:', !!user);
      
      // Try to fetch routes with authentication if user is logged in
      let response;
      if ((user as any)?.access_token || (user as any)?.session?.access_token) {
        const token = (user as any).access_token || (user as any).session.access_token;
        console.log('[INFO] Attempting authenticated routes fetch...');
        response = await fetch(`${baseUrl}/routes`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } else {
        console.log('[INFO] Attempting public routes fetch...');
        response = await fetch(`${baseUrl}/routes`);
      }
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.log('[INFO] Routes endpoint requires authentication, trying public endpoint...');
          // Try public routes endpoint
          const publicResponse = await fetch(`${baseUrl}/public/routes`);
          if (publicResponse.ok) {
            response = publicResponse;
          } else {
            throw new Error(`Public routes also failed: ${publicResponse.status}`);
          }
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
      
      const data = await response.json();
      console.log(`[INFO] Received ${data.length} routes from backend`);
      
      // Ensure data is an array before setting it
      if (Array.isArray(data)) {
        setRoutes(data);
        setError(null); // Clear any previous errors
      } else if (data.routes && Array.isArray(data.routes)) {
        // Handle case where response is wrapped in an object with routes property
        setRoutes(data.routes);
        setError(null); // Clear any previous errors
      } else {
        console.warn('[WARN] Invalid routes data received:', data);
        setRoutes([]);
        setError('Invalid data format received from server');
      }
    } catch (error: any) {
      console.error('Error fetching routes:', error);
      console.error('Error details:', error.message);
      console.error('Backend URL attempted:', getBaseUrl());
      
      // For new users or when backend is unavailable, show some sample routes
      if (!user || error.message.includes('401') || error.message.includes('403')) {
        console.log('[INFO] Showing sample routes for new users...');
        const sampleRoutes = [
          {
            id: 'sample_1',
            name: 'Welcome to Bolt - Sample Mountain Trail',
            description: 'Experience the beauty of mountain biking with this scenic trail. Perfect for beginners to get started!',
            distance: 15.2,
            duration: 90,
            difficulty: 'easy' as const,
            elevation_gain: 200,
            start_location: {
              latitude: 40.7128,
              longitude: -74.0060,
              address: 'Central Park, New York'
            },
            end_location: {
              latitude: 40.7589,
              longitude: -73.9851,
              address: 'Times Square, New York'
            },
            rating: 4.8,
            review_count: 156,
            images: [
              'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80',
              'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80'
            ],
            start_point_name: 'Central Park',
            end_point_name: 'Times Square',
            category: 'mountain'
          },
          {
            id: 'sample_2',
            name: 'City Explorer - Urban Adventure Route',
            description: 'Discover the city on two wheels with this urban cycling route. Great for sightseeing and exercise!',
            distance: 8.5,
            duration: 45,
            difficulty: 'easy' as const,
            elevation_gain: 50,
            start_location: {
              latitude: 40.7128,
              longitude: -74.0060,
              address: 'Battery Park, New York'
            },
            end_location: {
              latitude: 40.7589,
              longitude: -73.9851,
              address: 'Battery Park, New York'
            },
            rating: 4.5,
            review_count: 89,
            images: [
              'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80',
              'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80'
            ],
            start_point_name: 'Battery Park',
            end_point_name: 'Battery Park',
            category: 'urban'
          }
        ];
        setRoutes(sampleRoutes);
        setError('Showing sample routes. Sign up to access the full library!');
      } else {
        // Don't automatically fall back to mock data - let user see the error
        setRoutes([]);
        console.error('Routes failed to load - no fallback data');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRoutes();
  };

  // Fetch notification count
  const fetchNotificationCount = useCallback(async () => {
    if (!user?.id) {
      setNotificationCount(0);
      return;
    }

    try {
      console.log('[HOME] Fetching notification count for user:', user.id);
      const count = await notificationsApi.getUnreadCount(user.id);
      setNotificationCount(count);
      console.log('[HOME] Notification count:', count);
    } catch (error) {
      console.error('[HOME] Error fetching notification count:', error);
      setNotificationCount(0);
    }
  }, [user?.id]);

  /**
   * Fetch categories from the database using the new /categories endpoint
   * 
   * The backend provides:
   * - GET /categories - Get all categories
   * - GET /categories/:id - Get a specific category
   */
  const fetchCategories = useCallback(async () => {
    // Check if we should use mock data for testing
    const useMockData = MOCK_MODE; // Use the global mock mode setting
    
    if (useMockData) {
      console.log('[INFO] Using mock categories data for testing');
      setTimeout(() => {
        const mockCategories = [
          { id: 'all', name: 'All', icon: 'globe-outline' },
          { id: 'mock-1', name: 'Mountains', icon: 'mountain-outline' },
          { id: 'mock-2', name: 'Coastal', icon: 'water-outline' },
          { id: 'mock-3', name: 'Forest', icon: 'leaf-outline' },
          { id: 'mock-4', name: 'Urban', icon: 'business-outline' },
        ];
        setCategories(mockCategories);
      }, 500);
      return;
    }
    
    try {
      // Log the full URL for debugging
      const apiUrl = `${getBaseUrl()}/categories`;
      console.log(`[INFO] Fetching categories from: ${apiUrl}`);
      
      // Make the API call with detailed logging
      const response = await fetch(apiUrl);
      console.log(`[INFO] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ERROR] API returned error ${response.status}: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Parse the response
      const data = await response.json();
      console.log(`[INFO] Raw categories data:`, JSON.stringify(data).substring(0, 200) + '...');
      
      // Process the categories data based on its structure
      let categoriesData = [];
      
      // Handle different possible response formats with detailed logging
      if (Array.isArray(data)) {
        console.log('[INFO] Data is a direct array of categories');
        categoriesData = data;
      } else if (data.categories && Array.isArray(data.categories)) {
        console.log('[INFO] Data has a categories array property');
        categoriesData = data.categories;
      } else if (data.data && Array.isArray(data.data)) {
        console.log('[INFO] Data has a data array property');
        categoriesData = data.data;
      } else {
        console.error('[ERROR] Unexpected data structure:', JSON.stringify(data).substring(0, 200));
        throw new Error('Unexpected categories data format');
      }
      
      console.log(`[INFO] Found ${categoriesData.length} categories`);
      
      if (categoriesData.length === 0) {
        // If the API returns an empty array, create some categories manually for testing
        console.log('[INFO] No categories found, using sample categories');
        categoriesData = [
          { id: 'sample-1', name: 'Mountain', icon: 'mountain-outline' },
          { id: 'sample-2', name: 'Road', icon: 'bicycle-outline' },
          { id: 'sample-3', name: 'City', icon: 'business-outline' },
        ];
      }
      
      // Map the categories to our expected format and add the "All" option
      const allCategories = [
        { id: 'all', name: 'All', icon: 'globe-outline' },
        ...categoriesData.map((cat: any) => {
          const categoryId = cat.id || cat._id || String(cat.categoryId);
          const categoryName = cat.name || cat.categoryName;
          const categoryIcon = cat.icon || getIconForCategory(categoryName);
          
          console.log(`[DEBUG] Processed category: ${categoryName} (${categoryId}) with icon ${categoryIcon}`);
          
          return {
            id: categoryId,
            name: categoryName,
            icon: categoryIcon,
            description: cat.description
          };
        })
      ];
      
      setCategories(allCategories);
      console.log('[INFO] Categories processed successfully:', allCategories);
    } catch (error) {
      console.error('[ERROR] Failed to fetch categories:', error);
      
      // Fallback to default categories if backend is unavailable
      console.log('[WARN] Using fallback categories data');
      setCategories([
        { id: 'all', name: 'All', icon: 'globe-outline' },
        { id: 'mountain', name: 'Mountain', icon: 'mountain-outline' },
        { id: 'road', name: 'Road', icon: 'bicycle-outline' },
        { id: 'city', name: 'City', icon: 'business-outline' },
        { id: 'forest', name: 'Forest', icon: 'leaf-outline' },
      ]);
    }
  }, []);
  
  // Helper function to determine icon based on category name
  const getIconForCategory = (name: string): string => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('mountain')) return 'mountain-outline';
    if (lowerName.includes('road') || lowerName.includes('bike')) return 'bicycle-outline';
    if (lowerName.includes('city') || lowerName.includes('urban')) return 'business-outline';
    if (lowerName.includes('scenic') || lowerName.includes('view')) return 'image-outline';
    if (lowerName.includes('forest') || lowerName.includes('wood')) return 'leaf-outline';
    if (lowerName.includes('coast') || lowerName.includes('sea') || lowerName.includes('beach')) return 'water-outline';
    return 'trail-sign-outline'; // Default icon
  };

  const handleSidebarNavigation = (screen: string) => {
    console.log('[HOME] Sidebar navigation triggered for:', screen);
    switch (screen) {
      case 'profile':
        console.log('[HOME] Navigating to profile');
        router.push('/profile');
        break;
      case 'saved':
        console.log('[HOME] Navigating to saved routes');
        router.push('/saved-routes');
        break;
      case 'completed':
        console.log('[HOME] Navigating to completed routes');
        router.push('/completed-routes');
        break;
      case 'group-rides':
        console.log('[HOME] Navigating to group rides');
        router.push('/group-rides');
        break;
      default:
        console.log('[HOME] Unknown navigation target:', screen);
        break;
    }
  };


  // Initial data loading
  useEffect(() => {
    fetchRoutes();
    fetchCategories();
  }, [fetchRoutes, fetchCategories]);

  // Fetch notification count when user changes
  useEffect(() => {
    fetchNotificationCount();
  }, [fetchNotificationCount]);

  // Debug effect to log when routes change
  useEffect(() => {
    console.log('[DEBUG] Routes updated:', {
      totalRoutes: routes?.length || 0,
      selectedCategory,
      filterSettings: {
        minDistance,
        maxDistance,
        minDuration,
        maxDuration,
        showEasyRoutes,
        showIntermediateRoutes,
        showHardRoutes
      }
    });
  }, [routes, selectedCategory, minDistance, maxDistance, minDuration, maxDuration, showEasyRoutes, showIntermediateRoutes, showHardRoutes]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} translucent />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // Filter routes based on all criteria
  console.log('[DEBUG] Routes state:', routes);
  console.log('[DEBUG] Filter settings:', {
    selectedCategory,
    minDistance,
    maxDistance,
    minDuration,
    maxDuration,
    showEasyRoutes,
    showIntermediateRoutes,
    showHardRoutes
  });
  
  const filteredRoutes = routes?.filter(route => {
    // Filter by search query
    const matchesSearch = 
    route.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by category
    const matchesCategory = 
      !selectedCategory || 
      selectedCategory === 'all' || 
      route.category_id === selectedCategory ||
      (route.categories?.name.toLowerCase() === categories.find(c => c.id === selectedCategory)?.name.toLowerCase()) ||
      (route.tags && route.tags.some(tag => tag.toLowerCase() === categories.find(c => c.id === selectedCategory)?.name.toLowerCase()));
    
    // Filter by distance
    const matchesDistance = 
      (isNaN(parseFloat(minDistance)) || route.distance >= parseFloat(minDistance)) && 
      (isNaN(parseFloat(maxDistance)) || route.distance <= parseFloat(maxDistance));
    
    // Filter by duration
    const matchesDuration = 
      (isNaN(parseFloat(minDuration)) || route.duration >= parseFloat(minDuration)) && 
      (isNaN(parseFloat(maxDuration)) || route.duration <= parseFloat(maxDuration));
    
    // Filter by difficulty
    const matchesDifficulty = 
      (route.difficulty === 'easy' && showEasyRoutes) ||
      (route.difficulty === 'intermediate' && showIntermediateRoutes) ||
      (route.difficulty === 'hard' && showHardRoutes) ||
      !route.difficulty; // Include routes without difficulty info
    
    const matches = matchesSearch && matchesCategory && matchesDistance && matchesDuration && matchesDifficulty;
    
    // Debug logging for each route
    if (!matches) {
      console.log(`[DEBUG] Route "${route.name}" filtered out:`, {
        matchesSearch,
        matchesCategory,
        matchesDistance,
        matchesDuration,
        matchesDifficulty,
        routeDistance: route.distance,
        routeDuration: route.duration,
        routeDifficulty: route.difficulty
      });
    }
    
    return matches;
  }) || [];
  
  console.log(`[DEBUG] Filtered routes count: ${filteredRoutes.length} out of ${routes?.length || 0}`);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} translucent />
      

      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>
            {user?.name ? user.name : user?.email?.split('@')[0] || 'User'}
          </Text>
        </View>
        
        <View style={styles.headerButtons}>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => {
            console.log('[NOTIFICATIONS] Notification icon pressed');
            router.push('/notifications');
          }}
        >
          <Ionicons name="notifications-outline" size={24} color={theme.colors.primary} />
          {/* Notification badge - show count if > 0 */}
          {notificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {notificationCount > 99 ? '99+' : notificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setSidebarVisible(true)}
        >
          <Ionicons name="menu" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        
        {/* Temporary test button for group rides */}
        <TouchableOpacity
          style={[styles.menuButton, { marginLeft: 10, backgroundColor: theme.colors.primary }]}
          onPress={() => {
            console.log('[HOME] Direct navigation to group rides');
            router.push('/group-rides');
          }}
        >
          <Ionicons name="people" size={24} color="#FFFFFF" />
        </TouchableOpacity>
          <TouchableOpacity 
            style={styles.showAllButton}
            onPress={() => {
              setSelectedCategory('all');
              setMinDistance("0");
              setMaxDistance("110000");
              setMinDuration("0");
              setMaxDuration("158400");
              setShowEasyRoutes(true);
              setShowIntermediateRoutes(true);
              setShowHardRoutes(true);
            }}
          >
            <Ionicons name="refresh-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search routes..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="options-outline" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Routes</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowFilterModal(false)}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.modalScrollContentContainer}
            >
              {/* Categories in Modal */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Categories</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  style={styles.modalCategoriesContainer}
                  contentContainerStyle={styles.modalCategoriesContent}
                >
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={`modal-${category.id}`}
                      style={[
                        styles.modalCategoryItem,
                        selectedCategory === category.id && styles.modalCategoryItemActive
                      ]}
                      onPress={() => setSelectedCategory(
                        selectedCategory === category.id ? null : category.id
                      )}
                    >
                      <Text style={[
                        styles.modalCategoryText,
                        selectedCategory === category.id && styles.modalCategoryTextActive
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Distance Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Distance Range (km)</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Min</Text>
                    <TextInput
                      style={styles.textInput}
                      value={minDistance}
                      onChangeText={setMinDistance}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#999"
                    />
                  </View>
                  <Text style={styles.inputSeparator}>to</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Max</Text>
                    <TextInput
                      style={styles.textInput}
                      value={maxDistance}
                      onChangeText={setMaxDistance}
                      keyboardType="numeric"
                      placeholder="110000"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              </View>

              {/* Duration Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Duration Range (minutes)</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Min</Text>
                    <TextInput
                      style={styles.textInput}
                      value={minDuration}
                      onChangeText={setMinDuration}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#999"
                    />
                  </View>
                  <Text style={styles.inputSeparator}>to</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Max</Text>
                    <TextInput
                      style={styles.textInput}
                      value={maxDuration}
                      onChangeText={setMaxDuration}
                      keyboardType="numeric"
                      placeholder="158400"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
                <Text style={styles.helperText}>
                  Example: 60 = 1 hour, 120 = 2 hours, 1440 = 24 hours
                </Text>
              </View>

              {/* Difficulty Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Difficulty</Text>
                <View style={styles.difficultyOptions}>
                  <View style={styles.difficultyOption}>
                    <Text style={styles.difficultyLabel}>Easy</Text>
                    <Switch
                      value={showEasyRoutes}
                      onValueChange={setShowEasyRoutes}
                      trackColor={{ false: '#E0E0E0', true: theme.colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  <View style={styles.difficultyOption}>
                    <Text style={styles.difficultyLabel}>Intermediate</Text>
                    <Switch
                      value={showIntermediateRoutes}
                      onValueChange={setShowIntermediateRoutes}
                      trackColor={{ false: '#E0E0E0', true: theme.colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  <View style={styles.difficultyOption}>
                    <Text style={styles.difficultyLabel}>Hard</Text>
                    <Switch
                      value={showHardRoutes}
                      onValueChange={setShowHardRoutes}
                      trackColor={{ false: '#E0E0E0', true: theme.colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Reset and Apply Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={styles.resetButton}
                onPress={() => {
                  setSelectedCategory('all');
                  setMinDistance("0");
                  setMaxDistance("110000");
                  setMinDuration("0");
                  setMaxDuration("158400");
                  setShowEasyRoutes(true);
                  setShowIntermediateRoutes(true);
                  setShowHardRoutes(true);
                }}
              >
                <Text style={styles.resetButtonText}>Reset Filters</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.applyButton}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Featured Section */}
      <View style={styles.featuredSection}>
        <Text style={styles.sectionTitle}>
          {selectedCategory && selectedCategory !== 'all' 
            ? `${categories.find(c => c.id === selectedCategory)?.name} Routes` 
            : 'All Routes'}
        </Text>
      </View>

      {/* Routes List */}
      <FlatList
        data={filteredRoutes || []}
        renderItem={({ item }) => (
          <RouteCard 
            route={item} 
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.routesList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {error ? (
              <>
                {error.includes('sample routes') ? (
                  <>
                    <Ionicons name="information-circle-outline" size={60} color={theme.colors.primary} />
                    <Text style={styles.infoText}>Welcome to Bolt!</Text>
                    <Text style={styles.infoSubtext}>{error}</Text>
                    <TouchableOpacity style={styles.signUpButton} onPress={() => router.push('/login')}>
                      <Ionicons name="person-add" size={16} color="white" />
                      <Text style={styles.signUpButtonText}>Sign Up for Full Access</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons name="alert-circle-outline" size={60} color={theme.colors.error} />
                    <Text style={styles.errorText}>Failed to load routes</Text>
                    <Text style={styles.errorSubtext}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={fetchRoutes}>
                      <Ionicons name="refresh" size={16} color="white" />
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <>
                <Ionicons name="map-outline" size={60} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>No routes available</Text>
                <Text style={styles.emptySubtext}>Pull down to refresh</Text>
              </>
            )}
          </View>
        }
      />

      {/* Sidebar */}
      <Sidebar
        isVisible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onNavigate={handleSidebarNavigation}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0, // Account for translucent status bar on Android
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0, // Account for translucent status bar on Android
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  greeting: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  userName: {
    ...theme.typography.h2,
    marginTop: theme.spacing.xs,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  showAllButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  signOutButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
    opacity: 0.7,
  },
  searchInputContainer: {
    flex: 1,
    height: 46,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 23, // More rounded for a modern look
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    ...theme.typography.body,
    fontSize: 15,
    flex: 1,
    color: theme.colors.text,
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  categoriesContainer: {
    marginBottom: theme.spacing.md,
    height: 50, // Slightly shorter height for a cleaner look
    marginTop: 4, // Small margin to separate from search bar
  },
  categoriesContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center', // Center items vertically
    height: 50, // Match container height
  },
  categoriesLoadingContainer: {
    height: 50, // Match the height of the categories container
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  categoryItem: {
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20, // More rounded corners for a modern look
    backgroundColor: theme.colors.inputBackground,
    height: 36, // Fixed height to prevent text from being cut off
    justifyContent: 'center', // Center content vertically
    minWidth: 80, // Minimum width to ensure text fits
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  categoryItemActive: {
    backgroundColor: theme.colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
    borderColor: 'transparent',
  },
  categoryText: {
    ...theme.typography.body,
    fontSize: 14,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    includeFontPadding: false, // Remove extra padding that can cause text to be cut off
    textAlignVertical: 'center', // Center text vertically
    fontWeight: '500',
  },
  categoryTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  // Modal styles for categories
  modalCategoriesContainer: {
    marginVertical: theme.spacing.sm,
    height: 50,
  },
  modalCategoriesContent: {
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
    height: 50,
  },
  modalCategoryItem: {
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    height: 36,
    justifyContent: 'center',
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  modalCategoryItemActive: {
    backgroundColor: theme.colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
    borderColor: 'transparent',
  },
  modalCategoryText: {
    ...theme.typography.body,
    fontSize: 14,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontWeight: '500',
  },
  modalCategoryTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, // Extra padding for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
    maxHeight: '80%',
    flex: 1,
  },
  modalScrollContent: {
    flex: 1,
    marginBottom: theme.spacing.md,
  },
  modalScrollContentContainer: {
    paddingBottom: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    ...theme.typography.h2,
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSection: {
    marginBottom: theme.spacing.lg,
  },
  filterLabel: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  inputContainer: {
    flex: 1,
    maxWidth: '45%',
  },
  inputLabel: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    ...theme.typography.body,
  },
  inputSeparator: {
    ...theme.typography.body,
    marginHorizontal: theme.spacing.sm,
    color: theme.colors.textSecondary,
  },
  helperText: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
  },
  difficultyOptions: {
    marginTop: theme.spacing.sm,
  },
  difficultyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  difficultyLabel: {
    ...theme.typography.body,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  resetButton: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    flex: 0.48,
  },
  resetButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    flex: 0.48,
  },
  applyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  
  featuredSection: {
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.h2,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  routesList: {
    padding: theme.spacing.md,
    paddingTop: 0,
    paddingBottom: 80, // Add extra padding at bottom for better scrolling experience
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    marginTop: 60,
  },
  emptyText: {
    ...theme.typography.body,
    fontSize: 18,
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  emptySubtext: {
    ...theme.typography.body,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    color: theme.colors.textSecondary,
    opacity: 0.7,
    letterSpacing: 0.2,
  },
  errorText: {
    ...theme.typography.body,
    fontSize: 18,
    marginTop: theme.spacing.md,
    color: theme.colors.error,
    fontWeight: '500',
  },
  errorSubtext: {
    ...theme.typography.body,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    color: theme.colors.error,
    opacity: 0.8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  infoText: {
    ...theme.typography.body,
    fontSize: 18,
    marginTop: theme.spacing.md,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  infoSubtext: {
    ...theme.typography.body,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    color: theme.colors.textSecondary,
    opacity: 0.8,
    textAlign: 'center',
  },
  signUpButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  signUpButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default HomeScreen;
