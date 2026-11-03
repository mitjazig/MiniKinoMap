# Custom Cast receiver

The first Cast version uses Google’s **Default Media Receiver**. The phone stays the controller. The TV plays the route video from a network URL. Metrics stay on the phone.

A custom receiver is not required for that, and it is not implemented here.

## Why a custom receiver later

The default receiver can play an MP4. It cannot draw RUNSCAPE’s own overlay. A custom receiver would show the video and, on top of it:

- speed, for example 8.4 km/h
- distance, for example 2.4 km
- heart rate, for example 142 bpm
- incline, for example 3%

## What would be added

1. A Cast receiver app (HTML/JS) hosted on HTTPS and registered in the [Google Cast SDK Developer Console](https://cast.google.com/publish).
2. Replace `chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID` in `src/video/loadCastFramework.ts` with that receiver’s application id. The device chooser stays the standard one. Do not hardcode a device id.
3. Keep `CastVideoOutput` as the sender. `RouteProgressEngine` already talks to it through `VideoOutput`, so the workout engine still does not import the Cast SDK.
4. Send overlay updates as custom messages on the Cast session (`sendMessage` / a custom namespace), not as a new video seek. Suggested payload:

```json
{
  "speedKmh": 8.4,
  "distanceKm": 2.4,
  "heartRateBpm": 142,
  "inclinePercent": 3
}
```

5. Throttle those messages to about 1 Hz. The existing `CastSyncController` thresholds stay for the video clock: ignore drift under 2 seconds, seek only above 5 seconds.
6. If the custom receiver disconnects, keep the current behaviour: the workout continues and the phone resumes the local video at the last timestamp.

## What not to change

- Do not put BLE or Cast calls inside `WorkoutEngine`.
- Do not require the custom receiver for the heart-rate sensor or the treadmill.
- Local HTML video remains `LocalVideoOutput` and keeps its own playback-rate sync.
