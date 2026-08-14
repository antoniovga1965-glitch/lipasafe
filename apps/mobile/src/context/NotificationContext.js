import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { io } from 'socket.io-client';
import * as Notifications from 'expo-notifications';
import { getAccessToken } from '../utils/secureStorage';
import { BASE_URL, authFetch, getNavigator } from '../utils/api';


// Show banner even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const NotificationContext = createContext({
  unreadCount: 0, notifications: [],
  incrementUnread: () => {}, resetUnread: () => {}, prependNotif: () => {},
});

export function NotificationProvider({ children }) {
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);

  const incrementUnread = useCallback(() => setUnreadCount(p => p + 1), []);
  const resetUnread     = useCallback(() => setUnreadCount(0), []);

  const prependNotif = useCallback((notif) => {
    setNotifications(prev => [notif, ...prev]);
    incrementUnread();
   
    Notifications.scheduleNotificationAsync({
      content: {
        title: (notif.type || 'lipasafe').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        body:  notif.messageEn,
        data:  notif,
      },
      trigger: null,
    }).catch(() => {});
  }, [incrementUnread]);

  // Register push token once on mount
  useEffect(() => {
    const registerPush = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'LipaSafe',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;

        const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
        await authFetch('/user/push-token', {
          method: 'POST',
          body: JSON.stringify({ token: pushToken }),
        });
        console.log('[Push] token registered:', pushToken);
      } catch (e) {
        console.log('[Push] registration skipped:', e.message);
      }
    };
    registerPush();
  }, []);


  // Refresh push token whenever app comes back to foreground (handles token rot)
  useEffect(() => {
    const lastTokenRef = { current: null };
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const { data: freshToken } = await Notifications.getExpoPushTokenAsync();
        if (freshToken && freshToken !== lastTokenRef.current) {
          lastTokenRef.current = freshToken;
          await authFetch('/user/push-token', {
            method: 'POST',
            body: JSON.stringify({ token: freshToken }),
          });
          console.log('[Push] token refreshed on foreground');
        }
      } catch (e) {
        console.log('[Push] foreground refresh failed:', e.message);
      }
    });
    return () => sub.remove();
  }, []);

  // Fetch notifications on mount — populates bell count from server state
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res  = await authFetch('/user/notifications?limit=30&page=1');
        const json = await res.json();
        if (json.success && Array.isArray(json.notifications)) {
          setNotifications(json.notifications);
          setUnreadCount(json.unreadCount ?? 0);
          await Notifications.setBadgeCountAsync(json.unreadCount ?? 0);
        }
      } catch (e) {
        console.log('[Notifications] initial fetch failed:', e.message);
      }
    };
    fetchInitial();
  }, []);

  // Catch push notifications arriving when socket missed them (backgrounded, disconnected)
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (!data) return;
      setNotifications(prev => {
        const alreadyExists = prev.some(n => n.id && data.id && n.id === data.id);
        if (alreadyExists) return prev;
        incrementUnread();
        return [data, ...prev];
      });
    });
    return () => sub.remove();
  }, [incrementUnread]);

  // Notification tap → navigate
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const nav = getNavigator(); if (!data || !nav) return;
      const type = data.type || '';
      if (type === 'money_request_received' && data.requestId) {
        nav.navigate('HomeTab', {
          screen: 'RequestDetail',
          params: { requestId: data.requestId },
        });
      }
      if (type === 'TRANSFER_RECEIVED' || type === 'transfer_received') {
        nav.navigate('HomeTab', {
          screen: 'SafeTransfer',
          params: { transferId: data.transferId },
        });
      }
      const deliveryTypes = [
        'NEW_DELIVERY_ORDER', 'BEFORE_PHOTO_UPLOADED', 'BEFORE_PHOTO_REJECTED',
        'PICKUP_OTP_ISSUED', 'DELIVERY_STARTED', 'RECEIPT_OTP_ISSUED', 'PAYMENT_RELEASED',
        'dispute_opened', 'dispute_resolved_refund', 'dispute_resolved_pay',
      ];
      if (deliveryTypes.includes(type)) {
        nav.navigate('ProfileTab', { screen: 'DeliveryOrders' });
      }
      if (
        (type === 'FUNDI_PAYMENT_HELD' || type === 'FUNDI_PAYOUT_RECEIVED' || type === 'FUNDI_REFUND_SENT') &&
        data.fundiJobId
      ) {
        nav.navigate('ProfileTab', { screen: 'FundiJob', params: { jobId: data.fundiJobId } });
      }
      if (
        (type === 'custom_escrow_completed' || type === 'custom_escrow_refunded') &&
        data.customEscrowId
      ) {
        nav.navigate('HomeTab', { screen: 'CustomEscrowDetail', params: { escrowId: data.customEscrowId } });
      }
      if (type === 'payment_sent' || type === 'payment_received') {
        nav.navigate('HomeTab', { screen: 'TransactionsList' });
      }
      if ((type === 'FUNDI_JOB_CREATED' || type === 'FUNDI_OTP_ISSUED') && data.fundiJobId) {
        nav.navigate('ProfileTab', {
          screen: 'FundiJob',
          params: { jobId: data.fundiJobId },
        });
      }
      if (type === 'FUNDI_JOB_COMPLETED' && data.fundiJobId) {
        nav.navigate('ProfileTab', {
          screen: 'FundiReview',
          params: { jobId: data.fundiJobId },
        });
      }
      const houseTypes = [
        'house_payment_held', 'house_deal_accepted', 'house_deal_rejected',
        'house_confirmed', 'house_disputed', 'house_auto_released',
        'house_refunded', 'house_payout_sent', 'payment_received',
      ];
      if (houseTypes.includes(type) && data.houseEscrowId) {
        nav.navigate('HomeTab', {
          screen: 'HouseEscrowDetail',
          params: { escrowId: data.houseEscrowId },
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Socket connection
  useEffect(() => {
    const connect = async () => {
      const token = await getAccessToken();
      if (!token) return;

      const socket = io(BASE_URL, {
        auth:              { token },
        transports:        ['websocket'],
        reconnection:      true,
        reconnectionDelay: 2000,
      });

      socket.on('connect',       ()  => console.log('[Socket] connected:', socket.id));
      socket.on('disconnect',    (r) => console.log('[Socket] disconnected:', r));
      socket.on('connect_error', (e) => console.log('[Socket] error:', e.message));
      socket.on('notification',  (data) => {
        console.log('[Socket] notification:', data);
        prependNotif(data);
      });

      socketRef.current = socket;
    };

    connect();
    return () => { socketRef.current?.disconnect(); socketRef.current = null; };
  }, [prependNotif]);

  return (
    <NotificationContext.Provider value={{ unreadCount, notifications, incrementUnread, resetUnread, prependNotif }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
