import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import RegisterScreen from '../screens/RegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import SetPINScreen from '../screens/SetPINScreen';
import ForgotPINScreen from '../screens/ForgotPINScreen';
import HomeScreen from '../screens/HomeScreen';
import QuickSendScreen from '../screens/QuickSendScreen';
import AddMoneyScreen from '../screens/AddMoneyScreen';
import CustomPaymentScreen          from '../screens/CustomPaymentScreen';
import CustomEscrowCreateScreen    from '../screens/CustomEscrowCreateScreen';
import CustomEscrowPaymentScreen   from '../screens/CustomEscrowPaymentScreen';
import CustomEscrowDetailScreen    from '../screens/CustomEscrowDetailScreen';
import CustomEscrowListScreen      from '../screens/CustomEscrowListScreen';
import CustomEscrowDisputeScreen   from '../screens/CustomEscrowDisputeScreen';
import CustomEscrowDisputeResponseScreen from '../screens/CustomEscrowDisputeResponseScreen';
import CategoryScreen from '../screens/CategoryScreen';
import SelectServiceScreen from '../screens/SelectServiceScreen';
import BundlePaymentScreen from '../screens/BundlePaymentScreen';
import SecondHandMarketScreen from '../screens/SecondHandMarketScreen';
import DeliveryScreen from '../screens/DeliveryScreen';
import ContractorScreen from '../screens/ContractorScreen';
import HouseHuntingScreen         from '../screens/HouseHuntingScreen';
import HouseEscrowPaymentScreen  from '../screens/HouseEscrowPaymentScreen';
import HouseEscrowDisputeScreen  from '../screens/HouseEscrowDisputeScreen';
import HouseEscrowListScreen     from '../screens/HouseEscrowListScreen';
import HouseEscrowDetailScreen   from '../screens/HouseEscrowDetailScreen';
import HouseEscrowActiveScreen   from '../screens/HouseEscrowActiveScreen';
import ConfirmPaymentScreen from '../screens/ConfirmPaymentScreen';
import PaymentProcessingScreen from '../screens/PaymentProcessingScreen';
import PaymentSuccessScreen from '../screens/PaymentSuccessScreen';
import TransactionsListScreen from '../screens/TransactionsListScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import DisputeScreen from '../screens/DisputeScreen';
import OTPConfirmScreen from '../screens/OTPConfirmScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SellerVerificationScreen   from '../screens/SellerVerificationScreen';
import VerifiedSellersScreen       from '../screens/VerifiedSellersScreen';
import SellerDetailScreen          from '../screens/SellerDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChangePinScreen from '../screens/ChangePinScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SellerDashboardScreen from '../screens/SellerDashboardScreen';
import SecondHandHandoverScreen from '../screens/SecondHandHandoverScreen';
import SecondHandDisputeRespondScreen from '../screens/SecondHandDisputeRespondScreen';
import FundiJobScreen from '../screens/FundiJobScreen';
import FundiReviewScreen from '../screens/FundiReviewScreen';
import DeliveryConfirmationScreen from '../screens/DeliveryConfirmationScreen';
import DeliveryOrdersScreen from '../screens/DeliveryOrdersScreen';
import DeliveryBeforePhotoScreen from '../screens/DeliveryBeforePhotoScreen';
import DeliveryBuyerPhotoConfirmScreen from '../screens/DeliveryBuyerPhotoConfirmScreen';
import DeliveryPickupOTPScreen from '../screens/DeliveryPickupOTPScreen';
import DeliveryDuringPhotoScreen from '../screens/DeliveryDuringPhotoScreen';
import DeliveryReceiptScreen from '../screens/DeliveryReceiptScreen';
import DeliveryRatingScreen from '../screens/DeliveryRatingScreen';
import ConfirmSendScreen from '../screens/ConfirmSendScreen';
import SafeTransferScreen from '../screens/SafeTransferScreen';
import ReceiveScreen from '../screens/ReceiveScreen';
import RequestSuccessScreen from '../screens/RequestSuccessScreen';
import RequestDetailScreen  from '../screens/RequestDetailScreen';
import SupportScreen from '../screens/SupportScreen';

import { colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationContext';
import { connectSocket } from '../utils/socketClient';
import { authFetch } from '../utils/api';
import { getAccessToken } from '../utils/secureStorage';

const RootStack       = createStackNavigator();
const Tab             = createBottomTabNavigator();
const HomeStackNav    = createStackNavigator();
const PayStackNav     = createStackNavigator();
const ActivityStackNav = createStackNavigator();
const ProfileStackNav = createStackNavigator();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain"       component={HomeScreen} />
      <HomeStackNav.Screen name="Category"       component={CategoryScreen} />
      <HomeStackNav.Screen name="QuickSend"      component={QuickSendScreen} />
      <HomeStackNav.Screen name="AddMoney"       component={AddMoneyScreen} />
      <HomeStackNav.Screen name="Receive"         component={ReceiveScreen} />
      <HomeStackNav.Screen name="RequestSuccess" component={RequestSuccessScreen} />
      <HomeStackNav.Screen name="RequestDetail"  component={RequestDetailScreen} />
      <HomeStackNav.Screen name="Support"        component={SupportScreen} />
      <HomeStackNav.Screen name="ConfirmSend"    component={ConfirmSendScreen} />
      <HomeStackNav.Screen name="SafeTransfer"   component={SafeTransferScreen} />
      <HomeStackNav.Screen name="PaymentProcessing" component={PaymentProcessingScreen} options={{ gestureEnabled: false }} />
      <HomeStackNav.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
    </HomeStackNav.Navigator>
  );
}

function PayStack() {
  return (
    <PayStackNav.Navigator screenOptions={{ headerShown: false }}>
      <PayStackNav.Screen name="SelectService"    component={SelectServiceScreen} />
      <PayStackNav.Screen name="BundlePayment"    component={BundlePaymentScreen} />
      <PayStackNav.Screen name="SecondHandMarket" component={SecondHandMarketScreen} />
      <PayStackNav.Screen name="Delivery"         component={DeliveryScreen} />
      <PayStackNav.Screen name="Contractor"       component={ContractorScreen} />
      <PayStackNav.Screen name="HouseHunting"        component={HouseHuntingScreen} />
      <PayStackNav.Screen name="HouseEscrowPayment" component={HouseEscrowPaymentScreen} options={{ gestureEnabled: false }} />
      <PayStackNav.Screen name="HouseEscrowActive"  component={HouseEscrowActiveScreen}  options={{ gestureEnabled: false }} />
      <PayStackNav.Screen name="HouseEscrowDispute" component={HouseEscrowDisputeScreen} />
      <PayStackNav.Screen name="HouseEscrowDetail"  component={HouseEscrowDetailScreen} />
      <PayStackNav.Screen name="CustomPayment"       component={CustomPaymentScreen} />
      <PayStackNav.Screen name="CustomEscrowCreate"  component={CustomEscrowCreateScreen} />
      <PayStackNav.Screen name="CustomEscrowPayment" component={CustomEscrowPaymentScreen} options={{ gestureEnabled: false }} />
      <PayStackNav.Screen name="CustomEscrowDetail"  component={CustomEscrowDetailScreen} />
      <PayStackNav.Screen name="CustomEscrowList"    component={CustomEscrowListScreen} />
      <PayStackNav.Screen name="CustomEscrowDispute" component={CustomEscrowDisputeScreen} />
      <PayStackNav.Screen name="CustomEscrowDisputeResponse" component={CustomEscrowDisputeResponseScreen} />
      <PayStackNav.Screen name="ConfirmPayment"   component={ConfirmPaymentScreen} />
      <PayStackNav.Screen name="PaymentProcessing" component={PaymentProcessingScreen} />
      <PayStackNav.Screen name="PaymentSuccess"   component={PaymentSuccessScreen} />
      <PayStackNav.Screen name="FundiReview"            component={FundiReviewScreen} />
      <PayStackNav.Screen name="DeliveryBeforePhoto"     component={DeliveryBeforePhotoScreen} />
      <PayStackNav.Screen name="DeliveryBuyerPhotoConfirm" component={DeliveryBuyerPhotoConfirmScreen} />
      <PayStackNav.Screen name="DeliveryPickupOTP"       component={DeliveryPickupOTPScreen} />
      <PayStackNav.Screen name="DeliveryDuringPhoto"     component={DeliveryDuringPhotoScreen} />
      <PayStackNav.Screen name="DeliveryReceipt"         component={DeliveryReceiptScreen} />
      <PayStackNav.Screen name="DeliveryRating"          component={DeliveryRatingScreen} />
      <PayStackNav.Screen name="Dispute"                   component={DisputeScreen} />
    </PayStackNav.Navigator>
  );
}

function ActivityStack() {
  return (
    <ActivityStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ActivityStackNav.Screen name="TransactionsList"  component={TransactionsListScreen} />
      <ActivityStackNav.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <ActivityStackNav.Screen name="Dispute"           component={DisputeScreen} />
      <ActivityStackNav.Screen name="OTPConfirm"           component={OTPConfirmScreen} />
      <ActivityStackNav.Screen name="RequestDetail"       component={RequestDetailScreen} />
      <ActivityStackNav.Screen name="HouseEscrowActive"    component={HouseEscrowActiveScreen} options={{ gestureEnabled: false }} />
      <ActivityStackNav.Screen name="HouseEscrowDispute"   component={HouseEscrowDisputeScreen} />
      <ActivityStackNav.Screen name="HouseEscrowDetail"    component={HouseEscrowDetailScreen} />
      <ActivityStackNav.Screen name="HouseEscrowPayment"   component={HouseEscrowPaymentScreen} options={{ gestureEnabled: false }} />
    </ActivityStackNav.Navigator>
  );
}

function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }} initialRouteName="ProfileMain">
      <ProfileStackNav.Screen name="ProfileMain"          component={ProfileScreen} />
      <ProfileStackNav.Screen name="SellerVerification"   component={SellerVerificationScreen} />
          <ProfileStackNav.Screen name="VerifiedSellers"    component={VerifiedSellersScreen} />
          <ProfileStackNav.Screen name="SellerDetail"       component={SellerDetailScreen} />
      <ProfileStackNav.Screen name="Settings"             component={SettingsScreen} />
      <ProfileStackNav.Screen name="ChangePin"             component={ChangePinScreen} options={{ gestureEnabled: false }} />
      <ProfileStackNav.Screen name="Notifications"        component={NotificationsScreen} />
      <ProfileStackNav.Screen name="RequestDetail"       component={RequestDetailScreen} />
      <ProfileStackNav.Screen name="SellerDashboard"      component={SellerDashboardScreen} />
      <ProfileStackNav.Screen name="SecondHandHandover" component={SecondHandHandoverScreen} />
      <ProfileStackNav.Screen name="SecondHandDisputeRespond" component={SecondHandDisputeRespondScreen} />
      <ProfileStackNav.Screen name="FundiJob" component={FundiJobScreen} />
      <ProfileStackNav.Screen name="FundiReview" component={FundiReviewScreen} />
      <ProfileStackNav.Screen name="DeliveryOrders"           component={DeliveryOrdersScreen} />
      <ProfileStackNav.Screen name="DeliveryBeforePhoto"       component={DeliveryBeforePhotoScreen} />
      <ProfileStackNav.Screen name="DeliveryBuyerPhotoConfirm" component={DeliveryBuyerPhotoConfirmScreen} />
      <ProfileStackNav.Screen name="DeliveryPickupOTP"         component={DeliveryPickupOTPScreen} />
      <ProfileStackNav.Screen name="DeliveryDuringPhoto"       component={DeliveryDuringPhotoScreen} />
      <ProfileStackNav.Screen name="DeliveryReceipt"           component={DeliveryReceiptScreen} />
      <ProfileStackNav.Screen name="DeliveryRating"            component={DeliveryRatingScreen} />
      <ProfileStackNav.Screen name="DeliveryConfirmation"      component={DeliveryConfirmationScreen} />
      <ProfileStackNav.Screen name="Dispute"                   component={DisputeScreen} />
      <ProfileStackNav.Screen name="HouseEscrowList"   component={HouseEscrowListScreen} />
      <ProfileStackNav.Screen name="HouseEscrowDetail" component={HouseEscrowDetailScreen} />
      <ProfileStackNav.Screen name="HouseEscrowActive" component={HouseEscrowActiveScreen} options={{ gestureEnabled: false }} />
      <ProfileStackNav.Screen name="HouseEscrowDispute" component={HouseEscrowDisputeScreen} />
      <ProfileStackNav.Screen name="HouseEscrowPayment" component={HouseEscrowPaymentScreen} options={{ gestureEnabled: false }} />
    </ProfileStackNav.Navigator>
  );
}

function AnimatedTabIcon({ name, focused }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.spring(scale, { toValue: focused ? 1.2 : 1, friction: 3, useNativeDriver: true }).start();
  }, [focused]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={name} size={24} color={focused ? colors.primary : colors.grayDark} />
    </Animated.View>
  );
}

function MainTabs() {
  const { t }      = useLang();
  const insets     = useSafeAreaInsets();
  const { unreadCount, setUnreadCount, incrementUnread } = useNotifications();

  React.useEffect(() => {
    let socket = null;

    const init = async () => {
      // 1. Fetch initial unread count
      try {
        const res  = await authFetch('/user/notifications?limit=1');
        const data = await res.json();
        if (data.success) setUnreadCount(data.unreadCount);
      } catch {}

      // 2. Connect socket for real-time updates
      try {
        const token = await getAccessToken();
        if (token) {
          socket = connectSocket(token);
          socket.on('notification', () => incrementUnread());
        }
      } catch {}

    };

    init();
    return () => { if (socket) socket.off('notification'); };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:            false,
        tabBarActiveTintColor:  colors.primary,
        tabBarInactiveTintColor: colors.grayDark,
        tabBarStyle:            { height: 60 + insets.bottom, paddingBottom: insets.bottom || 10, paddingTop: 8, elevation: 8, borderTopWidth: 0, shadowOpacity: 0.1 },
        tabBarIcon: ({ focused }) => {
          let iconName;
          if (route.name === 'HomeTab')    iconName = focused ? 'home'   : 'home-outline';
          else if (route.name === 'PayTab')      iconName = focused ? 'cash'   : 'cash-outline';
          else if (route.name === 'ActivityTab') iconName = focused ? 'list'   : 'list-outline';
          else if (route.name === 'ProfileTab')  iconName = focused ? 'person' : 'person-outline';
          return <AnimatedTabIcon name={iconName} focused={focused} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab"     component={HomeStack}     options={{ tabBarLabel: t.home }} listeners={({ navigation }) => ({ tabPress: () => { navigation.navigate('HomeTab', { screen: 'HomeMain' }) } })} />
      <Tab.Screen name="PayTab"      component={PayStack}      options={{ tabBarLabel: t.pay }} />
      <Tab.Screen name="ActivityTab" component={ActivityStack} listeners={({ navigation }) => ({ tabPress: (e) => { e.preventDefault(); navigation.reset({ index: 0, routes: [{ name: 'ActivityTab', state: { routes: [{ name: 'TransactionsList' }] } }] }) } })} options={{ tabBarLabel: t.activity }} />
      <Tab.Screen name="ProfileTab"  component={ProfileStack}  listeners={({ navigation }) => ({ tabPress: (e) => { e.preventDefault(); navigation.reset({ index: 0, routes: [{ name: 'ProfileTab', state: { routes: [{ name: 'ProfileMain' }] } }] }) } })} options={{
        tabBarLabel: t.profile,
        tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
      }} />
    </Tab.Navigator>
  );
}


export default function AppNavigator({ navRef, onReady }) {
  return (
    <NavigationContainer ref={navRef} onReady={onReady} onStateChange={undefined} initialState={undefined}>
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <RootStack.Screen name="Splash"     component={SplashScreen} />
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="Login"      component={LoginScreen} />
        <RootStack.Screen name="Register"   component={RegisterScreen} />
        <RootStack.Screen name="SetPIN"     component={SetPINScreen} />
        <RootStack.Screen name="ForgotPIN"  component={ForgotPINScreen} />
        <RootStack.Screen name="Main"       component={MainTabs} />
        <RootStack.Screen name="DeliveryConfirmation" component={DeliveryConfirmationScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
