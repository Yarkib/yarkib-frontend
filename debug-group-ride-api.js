/**
 * Debug Script for Group Ride API Response
 * 
 * This script helps debug the actual API response structure
 * to identify data format mismatches between frontend and backend.
 */

const getBaseUrl = () => {
  // Adjust this URL to match your backend
  return 'http://localhost:3000'; // or your actual backend URL
};

const debugGroupRideAPI = async (groupRideId) => {
  try {
    console.log('🔍 [DEBUG] Testing Group Ride API...');
    console.log('🔍 [DEBUG] Group Ride ID:', groupRideId);
    console.log('🔍 [DEBUG] API URL:', `${getBaseUrl()}/group-rides/${groupRideId}`);
    
    const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('🔍 [DEBUG] Response Status:', response.status);
    console.log('🔍 [DEBUG] Response OK:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔍 [DEBUG] API Error:', errorText);
      return;
    }

    const data = await response.json();
    
    // 🔍 COMPREHENSIVE API RESPONSE ANALYSIS
    console.log('\n=== 🔍 FULL API RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n=== 🔍 RESPONSE STRUCTURE ANALYSIS ===');
    console.log('Available top-level fields:', Object.keys(data));
    
    // Check for participants/members
    console.log('\n=== 🔍 PARTICIPANTS/MEMBERS ANALYSIS ===');
    console.log('Has "members" field:', 'members' in data);
    console.log('Has "participants" field:', 'participants' in data);
    
    if (data.members) {
      console.log('Members array length:', data.members.length);
      if (data.members.length > 0) {
        console.log('First member structure:', JSON.stringify(data.members[0], null, 2));
        console.log('First member fields:', Object.keys(data.members[0]));
      }
    }
    
    if (data.participants) {
      console.log('Participants array length:', data.participants.length);
      if (data.participants.length > 0) {
        console.log('First participant structure:', JSON.stringify(data.participants[0], null, 2));
        console.log('First participant fields:', Object.keys(data.participants[0]));
      }
    }
    
    // Check for route data
    console.log('\n=== 🔍 ROUTE DATA ANALYSIS ===');
    console.log('Has "route" field:', 'route' in data);
    console.log('Has "routes" field:', 'routes' in data);
    
    if (data.route) {
      console.log('Route fields:', Object.keys(data.route));
    }
    
    if (data.routes) {
      console.log('Routes fields:', Object.keys(data.routes));
    }
    
    // Check for creator data
    console.log('\n=== 🔍 CREATOR DATA ANALYSIS ===');
    console.log('Has "creator" field:', 'creator' in data);
    console.log('Has "profiles" field:', 'profiles' in data);
    
    if (data.creator) {
      console.log('Creator fields:', Object.keys(data.creator));
    }
    
    if (data.profiles) {
      console.log('Profiles fields:', Object.keys(data.profiles));
    }
    
    // Expected vs Actual Analysis
    console.log('\n=== 🔍 EXPECTED VS ACTUAL ANALYSIS ===');
    
    const expectedFields = ['members', 'participants', 'route', 'routes', 'creator', 'profiles'];
    const actualFields = Object.keys(data);
    
    console.log('Expected fields:', expectedFields);
    console.log('Actual fields:', actualFields);
    
    const missingFields = expectedFields.filter(field => !actualFields.includes(field));
    const unexpectedFields = actualFields.filter(field => !expectedFields.includes(field));
    
    if (missingFields.length > 0) {
      console.log('❌ Missing expected fields:', missingFields);
    }
    
    if (unexpectedFields.length > 0) {
      console.log('⚠️  Unexpected fields found:', unexpectedFields);
    }
    
    // Status field analysis
    console.log('\n=== 🔍 STATUS FIELD ANALYSIS ===');
    const participants = data.members || data.participants || [];
    
    if (participants.length > 0) {
      participants.forEach((participant, index) => {
        console.log(`\nParticipant ${index + 1}:`);
        console.log('  - Has "status" field:', 'status' in participant);
        console.log('  - Has "invitation_status" field:', 'invitation_status' in participant);
        console.log('  - Has "joined_at" field:', 'joined_at' in participant);
        console.log('  - Has "role" field:', 'role' in participant);
        console.log('  - Has "user_id" field:', 'user_id' in participant);
        console.log('  - Has "profiles" field:', 'profiles' in participant);
        
        if (participant.status) console.log('  - status value:', participant.status);
        if (participant.invitation_status) console.log('  - invitation_status value:', participant.invitation_status);
        if (participant.joined_at) console.log('  - joined_at value:', participant.joined_at);
        if (participant.role) console.log('  - role value:', participant.role);
      });
    }
    
    console.log('\n=== 🔍 DEBUG COMPLETE ===');
    
  } catch (error) {
    console.error('🔍 [DEBUG] Error testing API:', error);
  }
};

// Usage: Call this function with a real group ride ID
// debugGroupRideAPI('your-group-ride-id-here');

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debugGroupRideAPI };
}

// For browser/React Native usage
if (typeof window !== 'undefined') {
  window.debugGroupRideAPI = debugGroupRideAPI;
}
