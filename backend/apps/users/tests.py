from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AuthenticationAPITests(APITestCase):
    def test_user_can_register(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "testuser",
                "email": "testuser@example.com",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "testuser")
        self.assertEqual(response.data["email"], "testuser@example.com")
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.filter(username="testuser").exists())

    def test_registered_user_password_is_hashed(self):
        self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "secureuser",
                "email": "secureuser@example.com",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        user = User.objects.get(username="secureuser")

        self.assertNotEqual(user.password, "StrongPassword123!DueNest")
        self.assertTrue(user.check_password("StrongPassword123!DueNest"))

    def test_user_can_login_and_receive_tokens(self):
        User.objects.create_user(
            username="loginuser",
            email="loginuser@example.com",
            password="StrongPassword123!DueNest",
        )

        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "loginuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_user_can_refresh_access_token(self):
        User.objects.create_user(
            username="refreshuser",
            email="refreshuser@example.com",
            password="StrongPassword123!DueNest",
        )

        login_response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "refreshuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        refresh_token = login_response.data["refresh"]

        refresh_response = self.client.post(
            "/api/v1/auth/refresh/",
            {
                "refresh": refresh_token,
            },
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)

    def test_authenticated_user_can_access_current_user_endpoint(self):
        user = User.objects.create_user(
            username="currentuser",
            email="currentuser@example.com",
            password="StrongPassword123!DueNest",
        )

        login_response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "currentuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get("/api/v1/users/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], user.username)
        self.assertEqual(response.data["email"], user.email)

    def test_anonymous_user_cannot_access_current_user_endpoint(self):
        response = self.client.get("/api/v1/users/me/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)