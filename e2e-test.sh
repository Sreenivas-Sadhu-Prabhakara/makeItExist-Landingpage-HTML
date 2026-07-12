#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
COOKIE_JAR="/tmp/cookies.txt"
TEST_RESULTS=0

# Initialize cookie jar
rm -f "$COOKIE_JAR"
touch "$COOKIE_JAR"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}MakeItExist E2E Test Suite${NC}"
echo -e "${BLUE}================================${NC}\n"

# Helper function to make requests with cookie persistence
function api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local desc=$4
    
    echo -e "${YELLOW}[TEST]${NC} $desc"
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    echo "  Response Code: $http_code"
    if [ ! -z "$body" ]; then
        echo "  Response: $(echo "$body" | head -c 200)"
    fi
    
    echo ""
    echo "$body"
}

# Test 1: Check if slots exist for 2026
echo -e "${BLUE}=== TEST 1: Check Slots for 2026 ===${NC}\n"

response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/slots?date=2026-01-02")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo -e "${YELLOW}[TEST]${NC} Fetch available slots for 2026-01-02"
echo "  Response Code: $http_code"
echo "  Response: $body" | head -c 300
echo ""

if [ "$http_code" == "200" ] && [ ! -z "$body" ]; then
    slot_count=$(echo "$body" | grep -o '"id"' | wc -l)
    echo -e "${GREEN}✓ PASS${NC}: Found $slot_count slots for 2026-01-02\n"
else
    echo -e "${RED}✗ FAIL${NC}: Could not fetch slots\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Test 2: Create a user booking
echo -e "${BLUE}=== TEST 2: Create User Booking ===${NC}\n"

# First get an available slot
available_slot=$(curl -s "$BASE_URL/api/slots?date=2026-01-02" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ ! -z "$available_slot" ]; then
    echo -e "${YELLOW}[TEST]${NC} Create booking for slot $available_slot"
    
    booking_data=$(cat <<EOF
{
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "slotId": "$available_slot",
    "notes": "Test booking"
}
EOF
)
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$booking_data" \
        "$BASE_URL/api/bookings")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    echo "  Response Code: $http_code"
    echo "  Response: $body" | head -c 300
    echo ""
    
    if [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
        booking_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "${GREEN}✓ PASS${NC}: Created booking with ID $booking_id\n"
    else
        echo -e "${RED}✗ FAIL${NC}: Could not create booking\n"
        TEST_RESULTS=$((TEST_RESULTS + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC}: No available slots found\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Test 3: Admin Login
echo -e "${BLUE}=== TEST 3: Admin Login ===${NC}\n"

echo -e "${YELLOW}[TEST]${NC} Login as admin (makeit_exist_admin)"

admin_login=$(cat <<EOF
{
    "username": "makeit_exist_admin",
    "password": "WHEREthereiswill1#"
}
EOF
)

response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$admin_login" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "$BASE_URL/admin/login")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "  Response Code: $http_code"
echo "  Response: $body" | head -c 300
echo ""

if [ "$http_code" == "200" ] || [ "$http_code" == "302" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Admin login successful\n"
else
    echo -e "${YELLOW}⚠ WARN${NC}: Admin login returned $http_code - checking session\n"
fi

# Test 4: Get admin session info
echo -e "${BLUE}=== TEST 4: Check Admin Session ===${NC}\n"

echo -e "${YELLOW}[TEST]${NC} Fetch current session info"

response=$(curl -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "$BASE_URL/api/session")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "  Response Code: $http_code"
echo "  Response: $body" | head -c 300
echo ""

if [ "$http_code" == "200" ] && echo "$body" | grep -q '"authenticated"'; then
    echo -e "${GREEN}✓ PASS${NC}: Session info retrieved\n"
else
    echo -e "${YELLOW}⚠ WARN${NC}: Could not verify session\n"
fi

# Test 5: Get admin bookings
echo -e "${BLUE}=== TEST 5: Admin Bookings List ===${NC}\n"

echo -e "${YELLOW}[TEST]${NC} Fetch all bookings (admin)"

response=$(curl -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "$BASE_URL/api/admin/bookings")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "  Response Code: $http_code"
booking_count=$(echo "$body" | grep -o '"id"' | wc -l)
echo "  Found $booking_count bookings"
echo "  Response: $body" | head -c 300
echo ""

if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Admin bookings retrieved\n"
else
    echo -e "${RED}✗ FAIL${NC}: Could not fetch admin bookings\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Test 6: Get admin slots
echo -e "${BLUE}=== TEST 6: Admin Slots List ===${NC}\n"

echo -e "${YELLOW}[TEST]${NC} Fetch all slots (admin)"

response=$(curl -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "$BASE_URL/api/admin/slots")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "  Response Code: $http_code"
slot_count=$(echo "$body" | grep -o '"id"' | wc -l)
echo "  Found $slot_count slots"
echo "  Response sample: $(echo "$body" | head -c 300)"
echo ""

if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Admin slots retrieved\n"
else
    echo -e "${RED}✗ FAIL${NC}: Could not fetch admin slots\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Test 7: Get admin stats
echo -e "${BLUE}=== TEST 7: Admin Statistics ===${NC}\n"

echo -e "${YELLOW}[TEST]${NC} Fetch statistics (admin)"

response=$(curl -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "$BASE_URL/api/admin/stats")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "  Response Code: $http_code"
echo "  Response: $body"
echo ""

if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Admin stats retrieved\n"
else
    echo -e "${RED}✗ FAIL${NC}: Could not fetch admin stats\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Test 8: Create another booking
echo -e "${BLUE}=== TEST 8: Create Second User Booking ===${NC}\n"

# Get another available slot
available_slot2=$(curl -s "$BASE_URL/api/slots?date=2026-01-09" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ ! -z "$available_slot2" ]; then
    echo -e "${YELLOW}[TEST]${NC} Create second booking for slot $available_slot2"
    
    booking_data=$(cat <<EOF
{
    "fullName": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1987654321",
    "slotId": "$available_slot2",
    "notes": "Another test booking"
}
EOF
)
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$booking_data" \
        "$BASE_URL/api/bookings")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    echo "  Response Code: $http_code"
    echo "  Response: $body" | head -c 300
    echo ""
    
    if [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
        echo -e "${GREEN}✓ PASS${NC}: Second booking created\n"
    else
        echo -e "${RED}✗ FAIL${NC}: Could not create second booking\n"
        TEST_RESULTS=$((TEST_RESULTS + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC}: No available slots found for second booking\n"
    TEST_RESULTS=$((TEST_RESULTS + 1))
fi

# Summary
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}================================${NC}"

if [ $TEST_RESULTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ $TEST_RESULTS test(s) failed${NC}"
    exit 1
fi
